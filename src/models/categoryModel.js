const pool = require("../config/db");

async function findAll(storeId, { page = 1, limit = 10, search = "" }) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      id,
      store_id,
      name,
      description,
      is_active,
      created_at,
      updated_at
    FROM categories
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
      )
    ORDER BY name ASC
    LIMIT $3 OFFSET $4
  `;

  const result = await pool.query(query, [
    storeId,
    search,
    limit,
    offset,
  ]);

  const countQuery = `
    SELECT COUNT(*)::int AS total
    FROM categories
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
      )
  `;

  const countResult = await pool.query(countQuery, [
    storeId,
    search,
  ]);

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
      description,
      is_active,
      created_at,
      updated_at
    FROM categories
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function create({ storeId, name, description }) {
  const query = `
    INSERT INTO categories (
      store_id,
      name,
      description
    )
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  const result = await pool.query(query, [
    storeId,
    name,
    description || null,
  ]);

  return result.rows[0];
}

async function update(id, storeId, { name, description, is_active }) {
  const query = `
    UPDATE categories
    SET
      name = $1,
      description = $2,
      is_active = $3,
      updated_at = NOW()
    WHERE id = $4
      AND store_id = $5
    RETURNING *
  `;

  const result = await pool.query(query, [
    name,
    description || null,
    is_active,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM categories
    WHERE id = $1
      AND store_id = $2
    RETURNING id
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  remove,
};