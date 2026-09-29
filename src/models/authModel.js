const pool = require("../config/db");

async function findUserByUsername(username) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password,
      u.full_name,
      u.is_active,

      r.id AS role_id,
      r.name AS role_name

    FROM users u

    INNER JOIN roles r
      ON r.id = u.role_id

    WHERE u.username = $1

    LIMIT 1
  `;

  const result = await pool.query(query, [username]);

  return result.rows[0] || null;
}

async function findUserById(id) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,

      r.id AS role_id,
      r.name AS role_name

    FROM users u

    INNER JOIN roles r
      ON r.id = u.role_id

    WHERE u.id = $1

    LIMIT 1
  `;

  const result = await pool.query(query, [id]);

  return result.rows[0] || null;
}

module.exports = {
  findUserByUsername,
  findUserById,
};