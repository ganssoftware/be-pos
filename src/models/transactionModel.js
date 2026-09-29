const pool = require("../config/db");

async function create(
  client,
  {
    storeId,
    shiftId,
    userId,
    customerId,
    transactionNumber,
    subtotal,
    discount,
    tax,
    total,
  }
) {
  const query = `
    INSERT INTO transactions (
      store_id,
      shift_id,
      user_id,
      customer_id,
      transaction_number,
      subtotal,
      discount,
      tax,
      total,
      status
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      'COMPLETED'
    )
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
      created_at
  `;

  const result = await client.query(query, [
    storeId,
    shiftId,
    userId,
    customerId || null,
    transactionNumber,
    subtotal,
    discount,
    tax,
    total,
  ]);

  return result.rows[0];
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
    discount,
    subtotal,
  }
) {
  const query = `
    INSERT INTO transaction_items (
      transaction_id,
      product_id,
      product_name,
      sku,
      quantity,
      price,
      discount,
      subtotal
    )
    VALUES (
      $1, $2, $3, $4,
      $5, $6, $7, $8
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
      created_at
  `;

  const result = await client.query(query, [
    transactionId,
    productId,
    productName,
    sku,
    quantity,
    price,
    discount,
    subtotal,
  ]);

  return result.rows[0];
}

async function findById(id, storeId) {
  const query = `
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
  `;

  const result = await pool.query(query, [
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function findItemsByTransactionId(
  transactionId
) {
  const query = `
    SELECT
      id,
      transaction_id,
      product_id,
      product_name,
      sku,
      quantity,
      price,
      discount,
      subtotal,
      created_at
    FROM transaction_items
    WHERE transaction_id = $1
    ORDER BY created_at ASC
  `;

  const result = await pool.query(query, [
    transactionId,
  ]);

  return result.rows;
}

async function findAll(
  storeId,
  {
    page = 1,
    limit = 20,
    search = "",
    status = "",
  }
) {
  const offset = (page - 1) * limit;

  const conditions = [
    "t.store_id = $1",
  ];

  const values = [storeId];

  if (search) {
    values.push(`%${search}%`);

    conditions.push(
      `t.transaction_number ILIKE $${values.length}`
    );
  }

  if (status) {
    values.push(status);

    conditions.push(
      `t.status = $${values.length}`
    );
  }

  const whereClause =
    conditions.join(" AND ");

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

  const [
    countResult,
    dataResult,
  ] = await Promise.all([
    pool.query(
      countQuery,
      countValues
    ),
    pool.query(
      dataQuery,
      values
    ),
  ]);

  const total = Number(
    countResult.rows[0].total
  );

  return {
    data: dataResult.rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(
        total / limit
      ),
    },
  };
}

async function findDetailById(
  id,
  storeId
) {
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

    WHERE t.id = $1
      AND t.store_id = $2

    LIMIT 1
  `;

  const itemsQuery = `
    SELECT
      id,
      transaction_id,
      product_id,
      product_name,
      sku,
      quantity,
      price,
      discount,
      subtotal,
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
      reference_number,
      paid_at
    FROM payments
    WHERE transaction_id = $1
    ORDER BY paid_at ASC
  `;

  const transactionResult =
    await pool.query(
      transactionQuery,
      [id, storeId]
    );

  if (
    transactionResult.rowCount === 0
  ) {
    return null;
  }

  const [
    itemsResult,
    paymentsResult,
  ] = await Promise.all([
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
  const query = `
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
    INNER JOIN users u ON u.id = t.user_id
    LEFT JOIN customers c ON c.id = t.customer_id
    WHERE t.id = $1
      AND t.store_id = $2
    LIMIT 1
    FOR UPDATE
  `;

  const result = await client.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function findItemsByTransactionIdForUpdate(client, transactionId) {
  const query = `
    SELECT
      id,
      transaction_id,
      product_id,
      product_name,
      sku,
      quantity,
      price,
      discount,
      subtotal,
      created_at
    FROM transaction_items
    WHERE transaction_id = $1
    ORDER BY product_id ASC
    FOR UPDATE
  `;

  const result = await client.query(query, [transactionId]);

  return result.rows;
}

async function updateStatus(client, id, storeId, status) {
  const query = `
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
  `;

  const result = await client.query(query, [
    status,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

module.exports = {
  create,
  createItem,
  findById,
  findItemsByTransactionId,
  findAll,
  findDetailById,
  findByIdForUpdate,
  findItemsByTransactionIdForUpdate,
  updateStatus,
};