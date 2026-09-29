const bcrypt = require("bcryptjs");

const authModel = require("../models/authModel");
const storeModel = require("../models/storeModel");

const { generateToken } = require("../utils/jwt");

async function login(username, password) {
  const user = await authModel.findUserByUsername(username);

  if (!user) {
    throw new Error("Username atau password salah");
  }

  if (!user.is_active) {
    throw new Error("Akun tidak aktif");
  }

  const passwordValid = await bcrypt.compare(
    password,
    user.password
  );

  if (!passwordValid) {
    throw new Error("Username atau password salah");
  }

  const token = generateToken({
    user_id: user.id,
    role_id: user.role_id,
    role: user.role_name,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role: {
        id: user.role_id,
        name: user.role_name,
      },
    },
  };
}

async function me(userId) {
  const user = await authModel.findUserById(userId);

  if (!user) {
    throw new Error("User tidak ditemukan");
  }

  if (!user.is_active) {
    throw new Error("Akun tidak aktif");
  }

  const stores = await storeModel.findStoresByUserId(user.id);

  return {
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: {
        id: user.role_id,
        name: user.role_name,
      },
    },
    stores: stores.map((store) => ({
      id: store.id,
      name: store.name,
      code: store.code,
    })),
  };
}

module.exports = {
  login,
  me,
};