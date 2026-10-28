
const bcrypt = require("bcryptjs");

const pool = require("../config/db");
const supabase = require("../config/supabase");
const userModel = require("../models/userModel");

async function createOwner(data) {
  const { username, email, password, full_name } = data;

  if (await userModel.findUserByUsername(username)) {
    throw new Error("Username sudah digunakan");
  }

  if (email && await userModel.findUserByEmail(email)) {
    throw new Error("Email sudah digunakan");
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

async function createCashier(ownerId, storeId, data) {
  const { username, email, password, full_name } = data;

  if (!storeId) {
    const error = new Error("Toko aktif wajib dipilih");
    error.statusCode = 400;
    throw error;
  }

  if (await userModel.findUserByUsername(username)) {
    throw new Error("Username sudah digunakan");
  }

  if (email && await userModel.findUserByEmail(email)) {
    throw new Error("Email sudah digunakan");
  }

  const role = await userModel.findRoleByName("cashier");

  if (!role) {
    throw new Error("Role cashier tidak ditemukan");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  return userModel.createCashierForStore({
    ownerId,
    username,
    email: email || null,
    password: hashedPassword,
    fullName: full_name,
    roleId: role.id,
    storeId,
  });
}

async function getOwners() {
  return userModel.findOwners();
}

async function getMyCashiers(ownerId, storeId) {
  if (!storeId) {
    const error = new Error("Toko aktif tidak ditemukan");
    error.statusCode = 400;
    throw error;
  }

  return userModel.findCashiersByOwnerId(ownerId, storeId);
}

async function getAvailableCashiers(ownerId, storeId) {
  if (!storeId) {
    const error = new Error("Toko tujuan tidak ditemukan");
    error.statusCode = 400;
    throw error;
  }

  return userModel.findAvailableInactiveCashiersByOwnerId(
    ownerId,
    storeId
  );
}

async function moveCashier(ownerId, cashierId, targetStoreId) {
  if (!targetStoreId) {
    const error = new Error("Toko tujuan wajib dipilih");
    error.statusCode = 400;
    throw error;
  }

  return userModel.moveInactiveCashierToStore(
    ownerId,
    cashierId,
    targetStoreId
  );
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
  const targetUser = await userModel.findUserById(targetUserId);

  if (!targetUser) {
    const error = new Error("User tidak ditemukan");
    error.statusCode = 404;
    throw error;
  }

  if (currentUserRole === "super-admin") {
    return userModel.setUserActive(targetUserId, isActive);
  }

  if (currentUserRole === "owner") {
    if (targetUser.role_name !== "cashier") {
      const error = new Error("Owner hanya dapat mengelola kasir");
      error.statusCode = 403;
      throw error;
    }

    const hasAccess = await userModel.ownerHasCashier(
      currentUserId,
      targetUserId
    );

    if (!hasAccess) {
      const error = new Error(
        "Anda tidak memiliki akses untuk mengelola kasir ini"
      );
      error.statusCode = 403;
      throw error;
    }
    
    return userModel.setUserActive(targetUserId, isActive);
  }

  const error = new Error("Anda tidak memiliki akses");
  error.statusCode = 403;
  throw error;
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

  const existingEmail = await userModel.findUserByEmail(email);

  if (existingEmail && existingEmail.id !== userId) {
    const error = new Error("Email sudah digunakan");
    error.statusCode = 409;
    throw error;
  }

  if (!new_password || !new_password.trim()) {
    return userModel.updateUserProfile(
      userId,
      full_name,
      email,
      null
    );
  }

  if (!current_password) {
    const error = new Error("Password lama wajib diisi");
    error.statusCode = 400;
    throw error;
  }

  const passwordMatch = await bcrypt.compare(
    current_password,
    user.password
  );

  if (!passwordMatch) {
    const error = new Error("Password lama salah");
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
    const error = new Error("Password minimal 6 karakter");
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

  const hashedPassword = await bcrypt.hash(new_password, 12);

  return userModel.updateUserProfile(
    userId,
    full_name,
    email,
    hashedPassword
  );
}

async function uploadProfilePhoto(userId, file) {
  if (!file) {
    const error = new Error("File foto wajib dipilih");
    error.statusCode = 400;
    throw error;
  }

  let extension = "jpg";

  if (file.mimetype === "image/png") {
    extension = "png";
  } else if (file.mimetype === "image/webp") {
    extension = "webp";
  }

  const filePath =
    `profiles/user-${userId}-${Date.now()}.${extension}`;

  const bucket = supabase.storage.from("profile-images");

  const { error: uploadError } = await bucket.upload(
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

  const { data: publicUrlData } = bucket.getPublicUrl(filePath);

  const user = await userModel.updateProfilePhoto(
    userId,
    publicUrlData.publicUrl
  );

  if (!user) {
    const error = new Error(
      "Foto berhasil diunggah, tetapi data profil gagal diperbarui"
    );
    error.statusCode = 500;
    throw error;
  }

  return user;
}

async function updateManagedUser(actorId, targetUserId, data) {
  const { full_name, email, new_password } = data;

  const actor = await userModel.findUserById(actorId);
  const target = await userModel.findUserById(targetUserId);

  if (!actor || !target) {
    const error = new Error("User tidak ditemukan");
    error.statusCode = 404;
    throw error;
  }

  if (actor.role_name === "super-admin") {
    if (target.role_name !== "owner") {
      const error = new Error(
        "Super-admin hanya dapat mengedit owner"
      );
      error.statusCode = 403;
      throw error;
    }
  } else if (actor.role_name === "owner") {
    if (target.role_name !== "cashier") {
      const error = new Error("Owner hanya dapat mengedit cashier");
      error.statusCode = 403;
      throw error;
    }

    const hasAccess = await userModel.ownerHasCashier(
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
  } else {
    const error = new Error("Anda tidak memiliki akses");
    error.statusCode = 403;
    throw error;
  }

  const existingEmail = await userModel.findUserByEmail(email);

  if (existingEmail && existingEmail.id !== targetUserId) {
    const error = new Error("Email sudah digunakan");
    error.statusCode = 409;
    throw error;
  }

  let hashedPassword = null;

  if (new_password && new_password.trim()) {
    if (new_password.length < 6) {
      const error = new Error("Password minimal 6 karakter");
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

    hashedPassword = await bcrypt.hash(new_password, 12);
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
  getAvailableCashiers,
  moveCashier,
  getAllUsers,
  updateUserStatus,
  updateMyProfile,
  uploadProfilePhoto,
  updateManagedUser,
};
