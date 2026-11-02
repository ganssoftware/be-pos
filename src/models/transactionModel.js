const pool = require("../config/db");

async function create(client, {
  storeId,
  shiftId,
  userId,
  customerId,
  transactionNumber,
  subtotal,
  discount,
  tax,
  total,
}) {
  const result = await client.query(
    `
      INSERT INTO transactions (
        store_id,
        shift_id,
        user_id,
        customer_id,
        transaction_number,
        business_date,
        subtotal,
        discount,
        tax,
        total,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5,
        (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
        $6, $7, $8, $9, 'COMPLETED'
      )
      RETURNING *
    `,
    [
      storeId,
      shiftId,
      userId,
      customerId,
      transactionNumber,
      subtotal,
      discount,
      tax,
      total,
    ]
  );

  return result.rows[0];
}

async function findProductPricingForCheckout(
  client,
  productId,
  storeId,
  barcode = null
) {
  const result = await client.query(
    `
      SELECT
        p.id,
        p.store_id,
        p.name,
        p.sku,
        p.barcode,
        p.purchase_price,
        p.selling_price,
        p.is_active,
        p.unit_id,
        base_unit.name AS base_unit_name,
        base_unit.abbreviation AS base_unit_abbreviation,

        t2.id AS tier_2_id,
        t2.min_quantity AS tier_2_min_quantity,
        t2.price AS tier_2_price,
        t2.is_active AS tier_2_active,

        t3.id AS tier_3_id,
        t3.unit_id AS tier_3_unit_id,
        t3.unit_quantity AS tier_3_unit_quantity,
        t3.price AS tier_3_price,
        t3.is_active AS tier_3_active,
        package_unit.name AS tier_3_unit_name,
        package_unit.abbreviation AS tier_3_unit_abbreviation,

        CASE
          WHEN pb.id IS NOT NULL THEN 3
          ELSE 1
        END AS matched_tier,

        COALESCE($3::varchar, p.barcode) AS scanned_barcode

      FROM products p

      LEFT JOIN units base_unit
        ON base_unit.id = p.unit_id

      LEFT JOIN product_price_tiers t2
        ON t2.product_id = p.id
        AND t2.tier = 2

      LEFT JOIN product_price_tiers t3
        ON t3.product_id = p.id
        AND t3.tier = 3

      LEFT JOIN units package_unit
        ON package_unit.id = t3.unit_id

      LEFT JOIN product_barcodes pb
        ON pb.product_id = p.id
        AND pb.barcode = $3
        AND pb.price_tier = 3
        AND pb.is_active = TRUE

      WHERE p.id = $1
        AND p.store_id = $2
        AND (
          $3::varchar IS NULL
          OR p.barcode = $3
          OR pb.id IS NOT NULL
        )

      LIMIT 1
      FOR UPDATE OF p
    `,
    [productId, storeId, barcode]
  );

  return result.rows[0] || null;
}

async function createItem(
  client,
  {
    transactionId,
    productId,
    productName,
    sku,
    quantity,
    price,
    costPrice,
    discount,
    subtotal,
    priceTier = 1,
    sellingUnitName,
    unitConversionFactor = 1,
    baseQuantity,
    barcode = null,
  }
) {
  const result = await client.query(
    `
      INSERT INTO transaction_items (
        transaction_id,
        product_id,
        product_name,
        sku,
        quantity,
        price,
        cost_price,
        discount,
        subtotal,
        price_tier,
        selling_unit_name,
        unit_conversion_factor,
        base_quantity,
        barcode
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14
      )
      RETURNING
        id,
        transaction_id,
        product_id,
        product_name,
        sku,
        quantity,
        price,
        discount,
        subtotal,
        price_tier,
        selling_unit_name,
        unit_conversion_factor,
        base_quantity,
        barcode,
        created_at
    `,
    [
      transactionId,
      productId,
      productName,
      sku,
      quantity,
      price,
      costPrice,
      discount,
      subtotal,
      priceTier,
      sellingUnitName,
      unitConversionFactor,
      baseQuantity,
      barcode,
    ]
  );

  return result.rows[0];
}

async function findById(id, storeId) {
  const result = await pool.query(
    `
      SELECT
        t.id,
        t.store_id,
        t.shift_id,
        t.user_id,
        t.customer_id,
        t.transaction_number,
        t.subtotal,
        t.discount,
        t.tax,
        t.total,
        t.status,
        t.created_at
      FROM transactions t
      WHERE t.id = $1
        AND t.store_id = $2
      LIMIT 1
    `,
    [id, storeId]
  );

  return result.rows[0] || null;
}

async function findItemsByTransactionId(
  transactionId,
  { includeCostPrice = false } = {}
) {
  const costColumn = includeCostPrice
    ? ", cost_price"
    : "";

  const result = await pool.query(
    `
      SELECT
        id,
        transaction_id,
        product_id,
        product_name,
        sku,
        quantity,
        price
        ${costColumn},
        discount,
        subtotal,
        price_tier,
        selling_unit_name,
        unit_conversion_factor,
        base_quantity,
        barcode,
        created_at
      FROM transaction_items
      WHERE transaction_id = $1
      ORDER BY created_at ASC
    `,
    [transactionId]
  );

  return result.rows;
}

async function findAll(
  storeId,
  {
    page = 1,
    limit = 20,
    search = "",
    status = "",
    userId = null,
    role = "owner",
  }
) {
  const offset = (page - 1) * limit;

  const conditions = ["t.store_id = $1"];
  const values = [storeId];

  if (role === "cashier" || role === "kasir") {
    if (!userId) {
      throw new Error("User ID kasir tidak tersedia");
    }

    values.push(userId);
    conditions.push(`t.user_id = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `t.transaction_number ILIKE $${values.length}`
    );
  }

  if (status) {
    values.push(status);
    conditions.push(`t.status = $${values.length}`);
  }

  const whereClause = conditions.join(" AND ");
  const countValues = [...values];

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM transactions t
    WHERE ${whereClause}
  `;

  values.push(limit);
  const limitParam = `$${values.length}`;

  values.push(offset);
  const offsetParam = `$${values.length}`;

  const dataQuery = `
    SELECT
      t.id,
      t.store_id,
      t.shift_id,
      t.user_id,
      t.customer_id,
      t.transaction_number,
      t.subtotal,
      t.discount,
      t.tax,
      t.total,
      t.status,
      t.business_date,
      t.created_at,
      u.username,
      u.full_name,
      c.name AS customer_name
    FROM transactions t
    INNER JOIN users u
      ON u.id = t.user_id
    LEFT JOIN customers c
      ON c.id = t.customer_id
    WHERE ${whereClause}
    ORDER BY t.created_at DESC
    LIMIT ${limitParam}
    OFFSET ${offsetParam}
  `;

  const [countResult, dataResult] = await Promise.all([
    pool.query(countQuery, countValues),
    pool.query(dataQuery, values),
  ]);

  const total = Number(countResult.rows[0].total);

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
}

async function findDetailById(
  id,
  storeId,
  {
    userId = null,
    role = "owner",
    includeCostPrice = false,
  } = {}
) {
  const conditions = [
    "t.id = $1",
    "t.store_id = $2",
  ];

  const values = [id, storeId];

  if (role === "cashier" || role === "kasir") {
    if (!userId) {
      throw new Error("User ID kasir tidak tersedia");
    }

    values.push(userId);
    conditions.push(`t.user_id = $${values.length}`);
  }

  const transactionQuery = `
    SELECT
      t.id,
      t.store_id,
      t.shift_id,
      t.user_id,
      t.customer_id,
      t.transaction_number,
      t.subtotal,
      t.discount,
      t.tax,
      t.total,
      t.status,
      t.business_date,
      t.created_at,
      u.username,
      u.full_name,
      c.name AS customer_name,
      c.phone AS customer_phone
    FROM transactions t
    INNER JOIN users u
      ON u.id = t.user_id
    LEFT JOIN customers c
      ON c.id = t.customer_id
    WHERE ${conditions.join(" AND ")}
    LIMIT 1
  `;

  const itemCostColumn = includeCostPrice
    ? ", cost_price"
    : "";

  const itemsQuery = `
    SELECT
      id,
      transaction_id,
      product_id,
      product_name,
      sku,
      quantity,
      price
      ${itemCostColumn},
      discount,
      subtotal,
      price_tier,
      selling_unit_name,
      unit_conversion_factor,
      base_quantity,
      barcode,
      created_at
    FROM transaction_items
    WHERE transaction_id = $1
    ORDER BY created_at ASC
  `;

  const paymentsQuery = `
    SELECT
      id,
      transaction_id,
      method,
      amount,
      amount_received,
      change_amount,
      reference_number,
      paid_at
    FROM payments
    WHERE transaction_id = $1
    ORDER BY paid_at ASC
  `;

  const transactionResult = await pool.query(
    transactionQuery,
    values
  );

  if (transactionResult.rowCount === 0) {
    return null;
  }

  const [itemsResult, paymentsResult] = await Promise.all([
    pool.query(itemsQuery, [id]),
    pool.query(paymentsQuery, [id]),
  ]);

  return {
    ...transactionResult.rows[0],
    items: itemsResult.rows,
    payments: paymentsResult.rows,
  };
}

async function findByIdForUpdate(client, id, storeId) {
  const result = await client.query(
    `
      SELECT
        t.id,
        t.store_id,
        t.shift_id,
        t.user_id,
        t.customer_id,
        t.transaction_number,
        t.subtotal,
        t.discount,
        t.tax,
        t.total,
        t.status,
        t.created_at,
        u.username,
        u.full_name,
        c.name AS customer_name
      FROM transactions t
      INNER JOIN users u
        ON u.id = t.user_id
      LEFT JOIN customers c
        ON c.id = t.customer_id
      WHERE t.id = $1
        AND t.store_id = $2
      LIMIT 1
      FOR UPDATE OF t
    `,
    [id, storeId]
  );

  return result.rows[0] || null;
}

async function findItemsByTransactionIdForUpdate(
  client,
  transactionId
) {
  const result = await client.query(
    `
      SELECT
        id,
        transaction_id,
        product_id,
        product_name,
        sku,
        quantity,
        price,
        cost_price,
        discount,
        subtotal,
        price_tier,
        selling_unit_name,
        unit_conversion_factor,
        base_quantity,
        barcode,
        created_at
      FROM transaction_items
      WHERE transaction_id = $1
      ORDER BY product_id ASC
      FOR UPDATE
    `,
    [transactionId]
  );

  return result.rows;
}

async function updateStatus(client, id, storeId, status) {
  const result = await client.query(
    `
      UPDATE transactions
      SET
        status = $1,
        updated_at = NOW()
      WHERE id = $2
        AND store_id = $3
      RETURNING
        id,
        store_id,
        shift_id,
        user_id,
        customer_id,
        transaction_number,
        subtotal,
        discount,
        tax,
        total,
        status,
        created_at,
        updated_at
    `,
    [status, id, storeId]
  );

  return result.rows[0] || null;
}

module.exports = {
  create,
  createItem,
  findProductPricingForCheckout,
  findById,
  findItemsByTransactionId,
  findAll,
  findDetailById,
  findByIdForUpdate,
  findItemsByTransactionIdForUpdate,
  updateStatus,
};
