const bcrypt = require("bcryptjs");

const pool = require("../config/db");
const supabase = require("../config/supabase");
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

async function updateMyProfile(userId, data) {
  const {
    full_name,
    email,
    current_password,
    new_password,
  } = data;

  const user = await userModel.findUserById(userId);

  if (!user) {
    const error = new Error("User tidak ditemukan");
    error.statusCode = 404;
    throw error;
  }

  const existingEmail =
    await userModel.findUserByEmail(email);

  if (
    existingEmail &&
    existingEmail.id !== userId
  ) {
    const error = new Error(
      "Email sudah digunakan"
    );
    error.statusCode = 409;
    throw error;
  }

  let hashedPassword = null;

  // PASSWORD TIDAK DIUBAH
  if (!new_password || !new_password.trim()) {
    return userModel.updateUserProfile(
      userId,
      full_name,
      email,
      null
    );
  }

  // PASSWORD DIUBAH
  if (!current_password) {
    const error = new Error(
      "Password lama wajib diisi"
    );
    error.statusCode = 400;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(
    current_password,
    user.password
  );

  if (!passwordMatch) {
    const error = new Error(
      "Password lama salah"
    );
    error.statusCode = 400;
    throw error;
  }

  if (current_password === new_password) {
    const error = new Error(
      "Password baru harus berbeda dari password lama"
    );
    error.statusCode = 400;
    throw error;
  }

  if (new_password.length < 6) {
    const error = new Error(
      "Password minimal 6 karakter"
    );
    error.statusCode = 400;
    throw error;
  }

  if (!/[A-Z]/.test(new_password)) {
    const error = new Error(
      "Password harus memiliki minimal 1 huruf besar"
    );
    error.statusCode = 400;
    throw error;
  }

  if (!/[^A-Za-z0-9]/.test(new_password)) {
    const error = new Error(
      "Password harus memiliki minimal 1 simbol"
    );
    error.statusCode = 400;
    throw error;
  }

  hashedPassword = await bcrypt.hash(
    new_password,
    12
  );

  return userModel.updateUserProfile(
    userId,
    full_name,
    email,
    hashedPassword
  );
}

async function uploadProfilePhoto(
  userId,
  file
) {
  if (!file) {
    const error = new Error(
      "File foto wajib dipilih"
    );
    error.statusCode = 400;
    throw error;
  }

  let extension = "jpg";

  if (file.mimetype === "image/png") {
    extension = "png";
  }

  if (file.mimetype === "image/webp") {
    extension = "webp";
  }

  const filePath =
    `profiles/user-${userId}-${Date.now()}.${extension}`;

  const { error: uploadError } =
    await supabase.storage
      .from("uploads")
      .upload(
        filePath,
        file.buffer,
        {
          contentType: file.mimetype,
          upsert: false,
        }
      );

  if (uploadError) {
    throw uploadError;
  }

  const { data: publicUrlData } =
    supabase.storage
      .from("uploads")
      .getPublicUrl(filePath);

  return userModel.updateProfilePhoto(
    userId,
    publicUrlData.publicUrl
  );
}

async function updateManagedUser(
  actorId,
  targetUserId,
  data
) {
  const {
    full_name,
    email,
    new_password,
  } = data;

  const actor =
    await userModel.findUserById(actorId);

  const target =
    await userModel.findUserById(targetUserId);

  if (!actor || !target) {
    const error = new Error(
      "User tidak ditemukan"
    );
    error.statusCode = 404;
    throw error;
  }

  // SUPER ADMIN
  if (actor.role_name === "super-admin") {
    if (target.role_name !== "owner") {
      const error = new Error(
        "Super-admin hanya dapat mengedit owner"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  // OWNER
  else if (actor.role_name === "owner") {
    if (target.role_name !== "cashier") {
      const error = new Error(
        "Owner hanya dapat mengedit cashier"
      );
      error.statusCode = 403;
      throw error;
    }

    const hasAccess =
      await userModel.ownerHasCashier(
        actorId,
        targetUserId
      );

    if (!hasAccess) {
      const error = new Error(
        "Cashier bukan bagian dari toko Anda"
      );
      error.statusCode = 403;
      throw error;
    }
  }

  // CASHIER
  else {
    const error = new Error(
      "Anda tidak memiliki akses"
    );
    error.statusCode = 403;
    throw error;
  }

  const existingEmail =
    await userModel.findUserByEmail(email);

  if (
    existingEmail &&
    existingEmail.id !== targetUserId
  ) {
    const error = new Error(
      "Email sudah digunakan"
    );
    error.statusCode = 409;
    throw error;
  }

  let hashedPassword = null;

  // Password opsional
  if (new_password && new_password.trim()) {
    if (new_password.length < 6) {
      const error = new Error(
        "Password minimal 6 karakter"
      );
      error.statusCode = 400;
      throw error;
    }

    if (!/[A-Z]/.test(new_password)) {
      const error = new Error(
        "Password harus memiliki minimal 1 huruf besar"
      );
      error.statusCode = 400;
      throw error;
    }

    if (!/[^A-Za-z0-9]/.test(new_password)) {
      const error = new Error(
        "Password harus memiliki minimal 1 simbol"
      );
      error.statusCode = 400;
      throw error;
    }

    hashedPassword = await bcrypt.hash(
      new_password,
      12
    );
  }

  return userModel.updateManagedUser(
    targetUserId,
    full_name,
    email,
    hashedPassword
  );
}

module.exports = {
  createOwner,
  createCashier,
  getOwners,
  getMyCashiers,
  getAllUsers,
  updateUserStatus,
  updateMyProfile,
  uploadProfilePhoto,
  updateManagedUser,
};