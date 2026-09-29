const pool = require("../config/db");

async function findAll(
  storeId,
  { page = 1, limit = 10, search = "", categoryId = null }
) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      p.id,
      p.store_id,
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.purchase_price,
      p.selling_price,
      p.minimum_stock,
      p.image_url,
      p.is_active,

      c.id AS category_id,
      c.name AS category_name,

      u.id AS unit_id,
      u.name AS unit_name,
      u.symbol AS unit_symbol,

      COALESCE(i.quantity, 0) AS stock,

      p.created_at,
      p.updated_at

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
      )

      AND (
        $3::uuid IS NULL
        OR p.category_id = $3
      )

    ORDER BY p.name ASC

    LIMIT $4
    OFFSET $5
  `;

  const result = await pool.query(query, [
    storeId,
    search,
    categoryId,
    limit,
    offset,
  ]);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM products p
    WHERE p.store_id = $1

      AND (
        $2 = ''
        OR p.name ILIKE '%' || $2 || '%'
        OR p.sku ILIKE '%' || $2 || '%'
        OR p.barcode ILIKE '%' || $2 || '%'
      )

      AND (
        $3::uuid IS NULL
        OR p.category_id = $3
      )
  `;

  const countResult = await pool.query(countQuery, [
    storeId,
    search,
    categoryId,
  ]);

  return {
    data: result.rows,
    total: countResult.rows[0].total,
  };
}

async function findById(id, storeId) {
  const query = `
    SELECT
      p.id,
      p.store_id,
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.purchase_price,
      p.selling_price,
      p.minimum_stock,
      p.image_url,
      p.is_active,

      c.id AS category_id,
      c.name AS category_name,

      u.id AS unit_id,
      u.name AS unit_name,
      u.symbol AS unit_symbol,

      COALESCE(i.quantity, 0) AS stock,

      p.created_at,
      p.updated_at

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.id = $1
      AND p.store_id = $2

    LIMIT 1
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function findByBarcode(barcode, storeId) {
  const query = `
    SELECT
      p.id,
      p.store_id,
      p.sku,
      p.barcode,
      p.name,
      p.description,
      p.purchase_price,
      p.selling_price,
      p.minimum_stock,
      p.image_url,
      p.is_active,

      c.id AS category_id,
      c.name AS category_name,

      u.id AS unit_id,
      u.name AS unit_name,
      u.symbol AS unit_symbol,

      COALESCE(i.quantity, 0) AS stock

    FROM products p

    LEFT JOIN categories c
      ON c.id = p.category_id

    LEFT JOIN units u
      ON u.id = p.unit_id

    LEFT JOIN inventory i
      ON i.product_id = p.id
      AND i.store_id = p.store_id

    WHERE p.barcode = $1
      AND p.store_id = $2

    LIMIT 1
  `;

  const result = await pool.query(query, [barcode, storeId]);

  return result.rows[0] || null;
}

async function create(data) {
  const query = `
    INSERT INTO products (
      store_id,
      category_id,
      unit_id,
      sku,
      barcode,
      name,
      description,
      purchase_price,
      selling_price,
      minimum_stock,
      image_url
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11
    )
    RETURNING *
  `;

  const result = await pool.query(query, [
    data.storeId,
    data.categoryId || null,
    data.unitId || null,
    data.sku,
    data.barcode || null,
    data.name,
    data.description || null,
    data.purchasePrice,
    data.sellingPrice,
    data.minimumStock,
    data.imageUrl || null,
  ]);

  return result.rows[0];
}

async function update(id, storeId, data) {
  const query = `
    UPDATE products
    SET
      category_id = $1,
      unit_id = $2,
      sku = $3,
      barcode = $4,
      name = $5,
      description = $6,
      purchase_price = $7,
      selling_price = $8,
      minimum_stock = $9,
      image_url = $10,
      is_active = $11,
      updated_at = NOW()
    WHERE id = $12
      AND store_id = $13
    RETURNING *
  `;

  const result = await pool.query(query, [
    data.categoryId || null,
    data.unitId || null,
    data.sku,
    data.barcode || null,
    data.name,
    data.description || null,
    data.purchasePrice,
    data.sellingPrice,
    data.minimumStock,
    data.imageUrl || null,
    data.isActive,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM products
    WHERE id = $1
      AND store_id = $2
    RETURNING id
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function deactivate(id, storeId) {
  const query = `
    UPDATE products
    SET
      is_active = false,
      updated_at = NOW()
    WHERE id = $1
      AND store_id = $2
      AND is_active = true
    RETURNING
      id,
      store_id,
      sku,
      barcode,
      name,
      is_active,
      updated_at
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  findByBarcode,
  create,
  update,
  remove,
  deactivate,
};