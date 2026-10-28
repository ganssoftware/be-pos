
const pool = require("../config/db");

async function findUserById(userId) {
  const query = `
    SELECT
      u.id,
      u.username,
      u.email,
      u.password,
      u.full_name,
      u.role_id,
      r.name AS role_name,
      u.is_active,
      u.profile_photo,
      u.created_at,
      u.updated_at
    FROM users u
    INNER JOIN roles r ON r.id = u.role_id
    WHERE u.id = $1
    LIMIT 1
  `;

  const result = await pool.query(query, [userId]);
  return result.rows[0] || null;
}

async function findUserByUsername(username) {
  const result = await pool.query(
    `
      SELECT id, username, email, full_name, is_active
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username]
  );

  return result.rows[0] || null;
}

async function findUserByEmail(email) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.role_id,
        r.name AS role_name,
        u.is_active,
        u.profile_photo
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function findRoleByName(roleName) {
  const result = await pool.query(
    `
      SELECT id, name
      FROM roles
      WHERE name = $1
      LIMIT 1
    `,
    [roleName]
  );

  return result.rows[0] || null;
}

async function createUser({
  username,
  email,
  password,
  fullName,
  roleId,
}) {
  const result = await pool.query(
    `
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
    `,
    [username, email, password, fullName, roleId]
  );

  return result.rows[0];
}

async function addUserToStore(storeId, userId) {
  await pool.query(
    `
      INSERT INTO store_users (store_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (store_id, user_id) DO NOTHING
    `,
    [storeId, userId]
  );
}

async function removeUserFromStore(storeId, userId) {
  await pool.query(
    `
      DELETE FROM store_users
      WHERE store_id = $1 AND user_id = $2
    `,
    [storeId, userId]
  );
}

async function findOwners() {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.profile_photo,
        u.is_active,
        u.created_at,
        r.id AS role_id,
        r.name AS role_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'owner'
      ORDER BY u.created_at DESC
    `
  );

  return result.rows;
}

async function findCashiersByOwnerId(ownerId, storeId) {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.profile_photo,
        u.is_active,
        u.created_at,
        r.id AS role_id,
        r.name AS role_name,
        su.store_id
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      INNER JOIN store_users su ON su.user_id = u.id
      INNER JOIN stores s ON s.id = su.store_id
      WHERE r.name = 'cashier'
        AND s.owner_id = $1
        AND s.id = $2
      ORDER BY u.created_at DESC
    `,
    [ownerId, storeId]
  );

  return result.rows;
}

async function findAvailableInactiveCashiersByOwnerId(
  ownerId,
  targetStoreId
) {
  const result = await pool.query(
    `
      SELECT DISTINCT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.profile_photo,
        u.is_active,
        u.created_at,
        r.id AS role_id,
        r.name AS role_name,
        source.store_id AS current_store_id,
        source.store_name AS current_store_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      INNER JOIN store_users su ON su.user_id = u.id
      INNER JOIN stores s ON s.id = su.store_id
      LEFT JOIN LATERAL (
        SELECT
          s2.id AS store_id,
          s2.name AS store_name
        FROM store_users su2
        INNER JOIN stores s2 ON s2.id = su2.store_id
        WHERE su2.user_id = u.id
          AND s2.owner_id = $1
        ORDER BY s2.name
        LIMIT 1
      ) source ON true
      WHERE r.name = 'cashier'
        AND u.is_active = false
        AND s.owner_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM store_users target_assignment
          WHERE target_assignment.user_id = u.id
            AND target_assignment.store_id = $2
        )
      ORDER BY u.created_at DESC
    `,
    [ownerId, targetStoreId]
  );

  return result.rows;
}

async function createCashierForStore({
  username,
  email,
  password,
  fullName,
  roleId,
  storeId,
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const storeResult = await client.query(
      `
        SELECT id
        FROM stores
        WHERE id = $1
          AND owner_id = $2
          AND is_active = true
        FOR UPDATE
      `,
      [storeId, arguments[0].ownerId]
    );

    if (storeResult.rowCount === 0) {
      const error = new Error(
        "Toko tidak ditemukan, tidak aktif, atau bukan milik Anda"
      );
      error.statusCode = 403;
      throw error;
    }

    const userResult = await client.query(
      `
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
      `,
      [username, email, password, fullName, roleId]
    );

    const cashier = userResult.rows[0];

    await client.query(
      `
        INSERT INTO store_users (store_id, user_id)
        VALUES ($1, $2)
      `,
      [storeId, cashier.id]
    );

    await client.query("COMMIT");
    return cashier;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function moveInactiveCashierToStore(
  ownerId,
  cashierId,
  targetStoreId
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetStoreResult = await client.query(
      `
        SELECT id
        FROM stores
        WHERE id = $1
          AND owner_id = $2
          AND is_active = true
        FOR UPDATE
      `,
      [targetStoreId, ownerId]
    );

    if (targetStoreResult.rowCount === 0) {
      const error = new Error(
        "Toko tujuan tidak ditemukan, tidak aktif, atau bukan milik Anda"
      );
      error.statusCode = 403;
      throw error;
    }

    const cashierResult = await client.query(
      `
        SELECT u.id, u.is_active, r.name AS role_name
        FROM users u
        INNER JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
        FOR UPDATE OF u
      `,
      [cashierId]
    );

    const cashier = cashierResult.rows[0];

    if (!cashier || cashier.role_name !== "cashier") {
      const error = new Error("Kasir tidak ditemukan");
      error.statusCode = 404;
      throw error;
    }

    if (cashier.is_active) {
      const error = new Error(
        "Hanya kasir nonaktif yang dapat dipindahkan"
      );
      error.statusCode = 409;
      throw error;
    }

    const assignmentsResult = await client.query(
      `
        SELECT s.id, s.owner_id
        FROM store_users su
        INNER JOIN stores s ON s.id = su.store_id
        WHERE su.user_id = $1
        FOR UPDATE OF su
      `,
      [cashierId]
    );

    const assignments = assignmentsResult.rows;

    if (assignments.length === 0) {
      const error = new Error(
        "Kasir tidak memiliki penugasan toko asal"
      );
      error.statusCode = 409;
      throw error;
    }

    const belongsToAnotherOwner = assignments.some(
      (assignment) => assignment.owner_id !== ownerId
    );

    if (belongsToAnotherOwner) {
      const error = new Error(
        "Kasir memiliki penugasan pada toko milik Owner lain"
      );
      error.statusCode = 403;
      throw error;
    }

    await client.query(
      `DELETE FROM store_users WHERE user_id = $1`,
      [cashierId]
    );

    await client.query(
      `
        INSERT INTO store_users (store_id, user_id)
        VALUES ($1, $2)
      `,
      [targetStoreId, cashierId]
    );

    const updatedResult = await client.query(
      `
        UPDATE users
        SET is_active = true,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          username,
          email,
          full_name,
          is_active,
          profile_photo,
          updated_at
      `,
      [cashierId]
    );

    await client.query("COMMIT");

    return updatedResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function findAllUsers() {
  const result = await pool.query(
    `
      SELECT
        u.id,
        u.username,
        u.email,
        u.full_name,
        u.profile_photo,
        u.is_active,
        u.created_at,
        r.id AS role_id,
        r.name AS role_name
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC
    `
  );

  return result.rows;
}

async function setUserActive(userId, isActive) {
  const result = await pool.query(
    `
      UPDATE users
      SET is_active = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        username,
        email,
        full_name,
        is_active,
        updated_at
    `,
    [isActive, userId]
  );

  return result.rows[0] || null;
}

async function updateUserProfile(
  userId,
  fullName,
  email,
  password = null
) {
  const result = await pool.query(
    `
      UPDATE users
      SET full_name = $1,
          email = $2,
          password = COALESCE($3, password),
          updated_at = NOW()
      WHERE id = $4
      RETURNING
        id,
        username,
        email,
        full_name,
        role_id,
        is_active,
        profile_photo,
        created_at,
        updated_at
    `,
    [fullName, email, password, userId]
  );

  return result.rows[0] || null;
}

async function updateManagedUser(
  userId,
  fullName,
  email,
  password = null
) {
  const result = await pool.query(
    `
      UPDATE users
      SET full_name = $1,
          email = $2,
          password = COALESCE($3, password),
          updated_at = NOW()
      WHERE id = $4
      RETURNING
        id,
        username,
        email,
        full_name,
        role_id,
        is_active,
        profile_photo,
        created_at,
        updated_at
    `,
    [fullName, email, password, userId]
  );

  return result.rows[0] || null;
}

async function ownerHasCashier(ownerId, cashierId) {
  const result = await pool.query(
    `
      SELECT 1
      FROM store_users su
      INNER JOIN stores s ON s.id = su.store_id
      INNER JOIN users u ON u.id = su.user_id
      INNER JOIN roles r ON r.id = u.role_id
      WHERE s.owner_id = $1
        AND u.id = $2
        AND r.name = 'cashier'
        AND s.is_active = true
      LIMIT 1
    `,
    [ownerId, cashierId]
  );

  return result.rowCount > 0;
}

async function updateProfilePhoto(userId, profilePhoto) {
  const result = await pool.query(
    `
      UPDATE users
      SET profile_photo = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        username,
        email,
        full_name,
        role_id,
        is_active,
        profile_photo,
        updated_at
    `,
    [profilePhoto, userId]
  );

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
  findAvailableInactiveCashiersByOwnerId,
  createCashierForStore,
  moveInactiveCashierToStore,
  findAllUsers,
  setUserActive,
  updateUserProfile,
  updateManagedUser,
  ownerHasCashier,
  updateProfilePhoto,
};
