const pool = require("../config/db");

async function findAll(
  storeId,
  { page = 1, limit = 20, search = "", lowStock = false }
) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      i.id,
      i.store_id,
      i.product_id,

      p.sku,
      p.barcode,
      p.name AS product_name,

      i.quantity,
      p.minimum_stock,

      u.name AS unit_name,
      u.symbol AS unit_symbol,

      CASE
        WHEN i.quantity <= p.minimum_stock
        THEN true
        ELSE false
      END AS is_low_stock,

      i.updated_at

    FROM inventory i

    INNER JOIN products p
      ON p.id = i.product_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    WHERE i.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
      )

      AND (
        $3 = false
        OR i.quantity <= p.minimum_stock
      )

    ORDER BY p.name ASC

    LIMIT $4
    OFFSET $5
  `;

  const result = await pool.query(query, [
    storeId,
    search,
    lowStock,
    limit,
    offset,
  ]);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM inventory i
    INNER JOIN products p
      ON p.id = i.product_id
    WHERE i.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
      )

      AND (
        $3 = false
        OR i.quantity <= p.minimum_stock
      )
  `;

  const countResult = await pool.query(
    countQuery,
    [
      storeId,
      search,
      lowStock,
    ]
  );

  return {
    data: result.rows,
    total: countResult.rows[0].total,
  };
}

async function findByProductId(
  productId,
  storeId
) {
  const query = `
    SELECT
      i.id,
      i.store_id,
      i.product_id,
      i.quantity,
      i.updated_at,

      p.sku,
      p.barcode,
      p.name AS product_name,
      p.minimum_stock,

      u.name AS unit_name,
      u.symbol AS unit_symbol

    FROM inventory i

    INNER JOIN products p
      ON p.id = i.product_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    WHERE i.product_id = $1
      AND i.store_id = $2

    LIMIT 1
  `;

  const result = await pool.query(
    query,
    [productId, storeId]
  );

  return result.rows[0] || null;
}

async function findProductForUpdate(
  client,
  productId,
  storeId
) {
  const query = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.is_active
    FROM products p
    WHERE p.id = $1
      AND p.store_id = $2
    LIMIT 1
  `;

  const result = await client.query(
    query,
    [productId, storeId]
  );

  return result.rows[0] || null;
}

async function getInventoryForUpdate(
  client,
  productId,
  storeId
) {
  const query = `
    SELECT
      id,
      quantity
    FROM inventory
    WHERE product_id = $1
      AND store_id = $2
    FOR UPDATE
  `;

  const result = await client.query(
    query,
    [productId, storeId]
  );

  return result.rows[0] || null;
}

async function increaseStock(
  client,
  inventoryId,
  quantity
) {
  const query = `
    UPDATE inventory
    SET
      quantity = quantity + $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await client.query(
    query,
    [quantity, inventoryId]
  );

  return result.rows[0];
}

async function setStock(
  client,
  inventoryId,
  quantity
) {
  const query = `
    UPDATE inventory
    SET
      quantity = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING *
  `;

  const result = await client.query(
    query,
    [quantity, inventoryId]
  );

  return result.rows[0];
}

async function createMovement(
  client,
  {
    storeId,
    productId,
    type,
    quantity,
    referenceType,
    referenceId,
    notes,
    createdBy,
  }
) {
  const query = `
    INSERT INTO inventory_movements (
      store_id,
      product_id,
      type,
      quantity,
      reference_type,
      reference_id,
      notes,
      created_by
    )
    VALUES (
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7,
      $8
    )
    RETURNING *
  `;

  const result = await client.query(
    query,
    [
      storeId,
      productId,
      type,
      quantity,
      referenceType || null,
      referenceId || null,
      notes || null,
      createdBy,
    ]
  );

  return result.rows[0];
}

async function findMovements(
  storeId,
  {
    page = 1,
    limit = 20,
    productId = null,
    type = null,
  }
) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      im.id,
      im.store_id,
      im.product_id,

      p.name AS product_name,
      p.sku,

      im.type,
      im.quantity,
      im.reference_type,
      im.reference_id,
      im.notes,

      u.id AS created_by_id,
      u.full_name AS created_by_name,

      im.created_at

    FROM inventory_movements im

    INNER JOIN products p
      ON p.id = im.product_id

    LEFT JOIN users u
      ON u.id = im.created_by

    WHERE im.store_id = $1

      AND (
        $2::uuid IS NULL
        OR im.product_id = $2
      )

      AND (
        $3::text IS NULL
        OR im.type = $3
      )

    ORDER BY im.created_at DESC

    LIMIT $4
    OFFSET $5
  `;

  const result = await pool.query(
    query,
    [
      storeId,
      productId,
      type,
      limit,
      offset,
    ]
  );

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM inventory_movements im

    WHERE im.store_id = $1

      AND (
        $2::uuid IS NULL
        OR im.product_id = $2
      )

      AND (
        $3::text IS NULL
        OR im.type = $3
      )
  `;

  const countResult = await pool.query(
    countQuery,
    [
      storeId,
      productId,
      type,
    ]
  );

  return {
    data: result.rows,
    total: countResult.rows[0].total,
  };
}

async function decreaseStock(
  client,
  inventoryId,
  quantity
) {
  const query = `
    UPDATE inventory
    SET
      quantity = quantity - $1,
      updated_at = NOW()
    WHERE id = $2
      AND quantity >= $1
    RETURNING
      id,
      store_id,
      product_id,
      quantity,
      updated_at
  `;

  const result = await client.query(query, [
    quantity,
    inventoryId,
  ]);

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findByProductId,
  findProductForUpdate,
  getInventoryForUpdate,
  increaseStock,
  setStock,
  createMovement,
  findMovements,
  decreaseStock,
};