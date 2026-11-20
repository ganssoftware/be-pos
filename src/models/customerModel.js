const pool = require("../config/db");


const customerSelect = `
  SELECT
    c.id,
    c.store_id,
    c.name,
    c.nik,
    c.phone,
    c.email,
    c.address,
    c.is_active,
    c.created_at,
    c.updated_at,
    COALESCE(p.balance, 0)::INTEGER AS points_balance
  FROM customers c
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(
      CASE
        WHEN type IN ('earn', 'refund') THEN points
        WHEN type = 'redeem' THEN -ABS(points)
        WHEN type = 'adjustment' THEN points
        ELSE 0
      END
    ), 0) AS balance
    FROM customer_points cp
    WHERE cp.customer_id = c.id
      AND cp.store_id = c.store_id
  ) p ON TRUE
`;


async function findAll(storeId, { page = 1, limit = 10, search = "" }) {
  const offset = (page - 1) * limit;
  const searchValue = `%${search}%`;
  const countQuery = `
    SELECT COUNT(*) AS total
    FROM customers
    WHERE store_id = $1
      AND ($2 = '' OR name ILIKE $3 OR phone ILIKE $3 OR email ILIKE $3 OR nik ILIKE $3)
  `;
  const dataQuery = `
    ${customerSelect}
    WHERE c.store_id = $1
      AND ($2 = '' OR c.name ILIKE $2 OR c.phone ILIKE $2 OR c.email ILIKE $2 OR c.nik ILIKE $2)
    ORDER BY c.name ASC
    LIMIT $3 OFFSET $4
  `;
  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, [storeId, search, searchValue]),
    pool.query(dataQuery, [storeId, searchValue, limit, offset]),
  ]);
  const total = Number(countResult.rows[0].total);
  return {
    data: dataResult.rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}


async function findById(id, storeId) {
  const result = await pool.query(`${customerSelect} WHERE c.id = $1 AND c.store_id = $2 LIMIT 1`, [id, storeId]);
  return result.rows[0] || null;
}


async function findByIdentifier(storeId, identifier) {
  const value = String(identifier || "").trim();
  if (!value) return null;
  const result = await pool.query(
    `${customerSelect}
     WHERE c.store_id = $1 AND c.is_active = TRUE
       AND (c.nik = $2 OR c.phone = $2)
     ORDER BY CASE WHEN c.nik = $2 THEN 0 ELSE 1 END
     LIMIT 1`,
    [storeId, value]
  );
  return result.rows[0] || null;
}


async function findPointsHistory(customerId, storeId, { page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const [countResult, dataResult, balanceResult] = await Promise.all([
    pool.query("SELECT COUNT(*)::INTEGER AS total FROM customer_points WHERE customer_id = $1 AND store_id = $2", [customerId, storeId]),
    pool.query(
      `SELECT id, store_id, customer_id, transaction_id, type, points, description, created_at
       FROM customer_points WHERE customer_id = $1 AND store_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [customerId, storeId, limit, offset]
    ),
    pool.query(
      `SELECT COALESCE(SUM(CASE WHEN type IN ('earn','refund') THEN points WHEN type='redeem' THEN -ABS(points) WHEN type='adjustment' THEN points ELSE 0 END),0)::INTEGER AS balance
       FROM customer_points WHERE customer_id = $1 AND store_id = $2`,
      [customerId, storeId]
    ),
  ]);
  const total = Number(countResult.rows[0].total);
  return {
    balance: Number(balanceResult.rows[0].balance),
    data: dataResult.rows,
    pagination: { page, limit, total, total_pages: Math.ceil(total / limit) },
  };
}


async function existsDuplicate(storeId, { nik, phone }, exceptId = null) {
  const result = await pool.query(
    `SELECT id, nik, phone FROM customers
     WHERE store_id = $1
       AND ($2::varchar IS NOT NULL AND nik = $2 OR $3::varchar IS NOT NULL AND phone = $3)
       AND ($4::uuid IS NULL OR id <> $4)
     LIMIT 1`,
    [storeId, nik || null, phone || null, exceptId]
  );
  return result.rows[0] || null;
}


async function create({ storeId, name, nik, phone, email, address }) {
  const result = await pool.query(
    `INSERT INTO customers (store_id, name, nik, phone, email, address)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, store_id, name, nik, phone, email, address, is_active, created_at, updated_at`,
    [storeId, name, nik || null, phone || null, email || null, address || null]
  );
  return result.rows[0];
}


async function update(id, storeId, { name, nik, phone, email, address }) {
  const result = await pool.query(
    `UPDATE customers SET name=$1, nik=$2, phone=$3, email=$4, address=$5, updated_at=NOW()
     WHERE id=$6 AND store_id=$7
     RETURNING id, store_id, name, nik, phone, email, address, is_active, created_at, updated_at`,
    [name, nik || null, phone || null, email || null, address || null, id, storeId]
  );
  return result.rows[0] || null;
}


async function setActive(id, storeId, isActive) {
  const result = await pool.query(
    `UPDATE customers SET is_active=$1, updated_at=NOW()
     WHERE id=$2 AND store_id=$3
     RETURNING id, store_id, name, nik, phone, email, address, is_active, created_at, updated_at`,
    [isActive, id, storeId]
  );
  return result.rows[0] || null;
}


async function remove(id, storeId) {
  const result = await pool.query("DELETE FROM customers WHERE id=$1 AND store_id=$2 RETURNING id", [id, storeId]);
  return result.rows[0] || null;
}


async function getLoyaltySettings(storeId) {
  const result = await pool.query(
    `SELECT * FROM loyalty_settings WHERE store_id=$1 LIMIT 1`,
    [storeId]
  );
  return result.rows[0] || {
    store_id: storeId,
    is_active: true,
    earn_amount: 10000,
    earn_points: 1,
    point_value: 100,
    minimum_redeem_points: 100,
  };
}


async function upsertLoyaltySettings(storeId, settings) {
  const result = await pool.query(
    `INSERT INTO loyalty_settings (store_id, is_active, earn_amount, earn_points, point_value, minimum_redeem_points)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (store_id) DO UPDATE SET
       is_active=EXCLUDED.is_active,
       earn_amount=EXCLUDED.earn_amount,
       earn_points=EXCLUDED.earn_points,
       point_value=EXCLUDED.point_value,
       minimum_redeem_points=EXCLUDED.minimum_redeem_points,
       updated_at=NOW()
     RETURNING *`,
    [storeId, settings.isActive, settings.earnAmount, settings.earnPoints, settings.pointValue, settings.minimumRedeemPoints]
  );
  return result.rows[0];
}


module.exports = {
  findAll, findById, findByIdentifier, findPointsHistory, existsDuplicate,
  create, update, setActive, remove, getLoyaltySettings, upsertLoyaltySettings,
};
