const pool = require("../config/db");

async function findUserById(userId) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.created_at,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r
      ON r.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [userId]);

  return result.rows[0] || null;
}

async function findUserByUsername(username) {
  const query = `
    SELECT
      id,
      username,
      email,
      full_name,
      is_active
    FROM users
    WHERE username = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [username]);

  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const query = `
    SELECT
      id,
      username,
      email,
      full_name,
      is_active
    FROM users
    WHERE email = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [email]);

  return result.rows[0] || null;
}

async function findRoleByName(roleName) {
  const query = `
    SELECT id, name
    FROM roles
    WHERE name = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [roleName]);

  return result.rows[0] || null;
}

async function createUser({
  username,
  email,
  password,
  fullName,
  roleId,
}) {
  const query = `
    INSERT INTO users (
      username,
      email,
      password,
      full_name,
      role_id,
      is_active
    )
    VALUES ($1, $2, $3, $4, $5, true)
    RETURNING
      id,
      username,
      email,
      full_name,
      role_id,
      is_active,
      created_at
  `;

  const result = await pool.query(query, [
    username,
    email,
    password,
    fullName,
    roleId,
  ]);

  return result.rows[0];
}

async function addUserToStore(storeId, userId) {
  const query = `
    INSERT INTO store_users (
      store_id,
      user_id
    )
    VALUES ($1, $2)
    ON CONFLICT (store_id, user_id)
    DO NOTHING
  `;

  await pool.query(query, [storeId, userId]);
}

async function removeUserFromStore(storeId, userId) {
  const query = `
    DELETE FROM store_users
    WHERE store_id = $1
      AND user_id = $2
  `;

  await pool.query(query, [storeId, userId]);
}

async function findOwners() {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.created_at,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r
      ON r.id = u.role_id
    WHERE r.name = 'owner'
    ORDER BY u.created_at DESC
  `;

  const result = await pool.query(query);

  return result.rows;
}

async function findCashiersByOwnerId(ownerId) {
  const query = `
    SELECT DISTINCT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.created_at,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r
      ON r.id = u.role_id
    INNER JOIN store_users su
      ON su.user_id = u.id
    INNER JOIN stores s
      ON s.id = su.store_id
    WHERE r.name = 'cashier'
      AND s.owner_id = $1
    ORDER BY u.created_at DESC
  `;

  const result = await pool.query(query, [ownerId]);

  return result.rows;
}

async function findAllUsers() {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.full_name,
      u.is_active,
      u.created_at,
      r.id AS role_id,
      r.name AS role_name
    FROM users u
    INNER JOIN roles r
      ON r.id = u.role_id
    ORDER BY u.created_at DESC
  `;

  const result = await pool.query(query);

  return result.rows;
}

async function setUserActive(userId, isActive) {
  const query = `
    UPDATE users
    SET
      is_active = $1,
      updated_at = NOW()
    WHERE id = $2
    RETURNING
      id,
      username,
      email,
      full_name,
      is_active,
      updated_at
  `;

  const result = await pool.query(query, [
    isActive,
    userId,
  ]);

  return result.rows[0] || null;
}

module.exports = {
  findUserById,
  findUserByUsername,
  findUserByEmail,
  findRoleByName,
  createUser,
  addUserToStore,
  removeUserFromStore,
  findOwners,
  findCashiersByOwnerId,
  findAllUsers,
  setUserActive,
};