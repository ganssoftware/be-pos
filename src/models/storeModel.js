const pool = require("../config/db");

async function findStoresByUserId(userId) {
  const query = `
    SELECT
      s.id,
      s.name,
      s.code,
      s.address,
      s.phone,
      s.is_active
    FROM stores s
    INNER JOIN store_users su
      ON su.store_id = s.id
    WHERE su.user_id = $1
      AND s.is_active = true
    ORDER BY s.name ASC
  `;

  const result = await pool.query(query, [userId]);

  return result.rows;
}

async function userHasStoreAccess(userId, storeId) {
  const query = `
    SELECT 1
    FROM store_users su
    INNER JOIN stores s
      ON s.id = su.store_id
    WHERE su.user_id = $1
      AND su.store_id = $2
      AND s.is_active = true
    LIMIT 1
  `;

  const result = await pool.query(query, [userId, storeId]);

  return result.rowCount > 0;
}

module.exports = {
  findStoresByUserId,
  userHasStoreAccess,
};