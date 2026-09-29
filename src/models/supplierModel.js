const pool = require("../config/db");

async function findAll(
  storeId,
  { page = 1, limit = 10, search = "" }
) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      id,
      store_id,
      name,
      phone,
      email,
      address,
      created_at,
      updated_at
    FROM suppliers
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
        OR phone ILIKE '%' || $2 || '%'
        OR email ILIKE '%' || $2 || '%'
      )
    ORDER BY name ASC
    LIMIT $3
    OFFSET $4
  `;

  const result = await pool.query(
    query,
    [
      storeId,
      search,
      limit,
      offset,
    ]
  );

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM suppliers
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
        OR phone ILIKE '%' || $2 || '%'
        OR email ILIKE '%' || $2 || '%'
      )
  `;

  const countResult = await pool.query(
    countQuery,
    [
      storeId,
      search,
    ]
  );

  return {
    data: result.rows,
    total: countResult.rows[0].total,
  };
}

async function findById(id, storeId) {
  const query = `
    SELECT
      id,
      store_id,
      name,
      phone,
      email,
      address,
      created_at,
      updated_at
    FROM suppliers
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(
    query,
    [id, storeId]
  );

  return result.rows[0] || null;
}

async function create({
  storeId,
  name,
  phone,
  email,
  address,
}) {
  const query = `
    INSERT INTO suppliers (
      store_id,
      name,
      phone,
      email,
      address
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const result = await pool.query(
    query,
    [
      storeId,
      name,
      phone || null,
      email || null,
      address || null,
    ]
  );

  return result.rows[0];
}

async function update(
  id,
  storeId,
  {
    name,
    phone,
    email,
    address,
  }
) {
  const query = `
    UPDATE suppliers
    SET
      name = $1,
      phone = $2,
      email = $3,
      address = $4,
      updated_at = NOW()
    WHERE id = $5
      AND store_id = $6
    RETURNING *
  `;

  const result = await pool.query(
    query,
    [
      name,
      phone || null,
      email || null,
      address || null,
      id,
      storeId,
    ]
  );

  return result.rows[0] || null;
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM suppliers
    WHERE id = $1
      AND store_id = $2
    RETURNING id
  `;

  const result = await pool.query(
    query,
    [id, storeId]
  );

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};