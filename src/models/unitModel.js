const pool = require("../config/db");

async function findAll(storeId, { page = 1, limit = 10, search = "" }) {
  const offset = (page - 1) * limit;

  const query = `
    SELECT
      id,
      store_id,
      name,
      symbol,
      created_at,
      updated_at
    FROM units
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
        OR symbol ILIKE '%' || $2 || '%'
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
    FROM units
    WHERE store_id = $1
      AND (
        $2 = ''
        OR name ILIKE '%' || $2 || '%'
        OR symbol ILIKE '%' || $2 || '%'
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
      symbol,
      created_at,
      updated_at
    FROM units
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [id, storeId]);

  return result.rows[0] || null;
}

async function create({ storeId, name, symbol }) {
  const query = `
    INSERT INTO units (
      store_id,
      name,
      symbol
    )
    VALUES ($1, $2, $3)
    RETURNING *
  `;

  const result = await pool.query(query, [
    storeId,
    name,
    symbol || null,
  ]);

  return result.rows[0];
}

async function update(id, storeId, { name, symbol }) {
  const query = `
    UPDATE units
    SET
      name = $1,
      symbol = $2,
      updated_at = NOW()
    WHERE id = $3
      AND store_id = $4
    RETURNING *
  `;

  const result = await pool.query(query, [
    name,
    symbol || null,
    id,
    storeId,
  ]);

  return result.rows[0] || null;
}

async function remove(id, storeId) {
  const query = `
    DELETE FROM units
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