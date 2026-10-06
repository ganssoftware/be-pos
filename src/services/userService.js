const bcrypt = require("bcryptjs");

const pool = require("../config/db");
const userModel = require("../models/userModel");

async function createOwner(data) {
  const {
    username,
    email,
    password,
    full_name,
  } = data;

  const existingUsername =
    await userModel.findUserByUsername(username);

  if (existingUsername) {
    throw new Error("Username sudah digunakan");
  }

  if (email) {
    const existingEmail =
      await userModel.findUserByEmail(email);

    if (existingEmail) {
      throw new Error("Email sudah digunakan");
    }
  }

  const role = await userModel.findRoleByName("owner");

  if (!role) {
    throw new Error("Role owner tidak ditemukan");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  return userModel.createUser({
    username,
    email: email || null,
    password: hashedPassword,
    fullName: full_name,
    roleId: role.id,
  });
}

async function createCashier(ownerId, data) {
  const {
    username,
    email,
    password,
    full_name,
    store_ids,
  } = data;

  if (!Array.isArray(store_ids) || store_ids.length === 0) {
    throw new Error(
      "Minimal satu toko harus dipilih"
    );
  }

  const existingUsername =
    await userModel.findUserByUsername(username);

  if (existingUsername) {
    throw new Error("Username sudah digunakan");
  }

  if (email) {
    const existingEmail =
      await userModel.findUserByEmail(email);

    if (existingEmail) {
      throw new Error("Email sudah digunakan");
    }
  }

  // Pastikan SEMUA toko memang milik owner
  const storeResult = await pool.query(
    `
    SELECT id
    FROM stores
    WHERE owner_id = $1
      AND id = ANY($2::uuid[])
      AND is_active = true
    `,
    [ownerId, store_ids]
  );

  if (storeResult.rows.length !== store_ids.length) {
    throw new Error(
      "Ada toko yang bukan milik Anda atau tidak aktif"
    );
  }

  const role = await userModel.findRoleByName("cashier");

  if (!role) {
    throw new Error("Role cashier tidak ditemukan");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

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
      [
        username,
        email || null,
        hashedPassword,
        full_name,
        role.id,
      ]
    );

    const cashier = userResult.rows[0];

    for (const storeId of store_ids) {
      await client.query(
        `
        INSERT INTO store_users (
          store_id,
          user_id
        )
        VALUES ($1, $2)
        ON CONFLICT (store_id, user_id)
        DO NOTHING
        `,
        [storeId, cashier.id]
      );
    }

    await client.query("COMMIT");

    return cashier;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getOwners() {
  return userModel.findOwners();
}

async function getMyCashiers(ownerId) {
  return userModel.findCashiersByOwnerId(ownerId);
}

async function getAllUsers() {
  return userModel.findAllUsers();
}

async function updateUserStatus(
  currentUserId,
  currentUserRole,
  targetUserId,
  isActive
) {
  const targetUser =
    await userModel.findUserById(targetUserId);

  if (!targetUser) {
    throw new Error("User tidak ditemukan");
  }

  if (currentUserRole === "super-admin") {
    return userModel.setUserActive(
      targetUserId,
      isActive
    );
  }

  if (currentUserRole === "owner") {
    // Owner hanya boleh mengelola cashier
    if (targetUser.role_name !== "cashier") {
      throw new Error(
        "Owner hanya dapat mengelola kasir"
      );
    }

    const result = await pool.query(
      `
      SELECT 1
      FROM store_users su
      INNER JOIN stores s
        ON s.id = su.store_id
      WHERE su.user_id = $1
        AND s.owner_id = $2
        AND s.is_active = true
      LIMIT 1
      `,
      [
        targetUserId,
        currentUserId,
      ]
    );

    if (result.rowCount === 0) {
      throw new Error(
        "Anda tidak memiliki akses untuk mengelola kasir ini"
      );
    }

    return userModel.setUserActive(
      targetUserId,
      isActive
    );
  }

  throw new Error(
    "Anda tidak memiliki akses"
  );
}

module.exports = {
  createOwner,
  createCashier,
  getOwners,
  getMyCashiers,
  getAllUsers,
  updateUserStatus,
};