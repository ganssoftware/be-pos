const bcrypt = require("bcryptjs");

const authModel = require("../models/authModel");
const storeModel = require("../models/storeModel");

const {
  generateToken,
  generateRefreshToken,
  hashRefreshToken,
} = require("../utils/jwt");

async function login(username, password) {
  const user = await authModel.findUserByUsername(username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw new Error("Username atau password salah");
  }

  if (!user.is_active) {
    throw new Error("Akun tidak aktif");
  }

  const refreshToken = generateRefreshToken();
  const refreshTokenHash = hashRefreshToken(refreshToken);

  const session = await authModel.createSession(
    user.id,
    refreshTokenHash
  );

  const token = generateToken({
    user_id: user.id,
    role_id: user.role_id,
    role: user.role_name,
    sid: session.id,
  });

  return {
    token,
    access_token: token,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      profile_photo: user.profile_photo,
      role: {
        id: user.role_id,
        name: user.role_name,
      },
    },
  };
}

async function refresh(refreshToken) {
  if (
    typeof refreshToken !== "string" ||
    !/^[a-f0-9]{96}$/i.test(refreshToken)
  ) {
    const error = new Error("Refresh token tidak valid atau sesi berakhir");
    error.statusCode = 401;
    throw error;
  }

  const oldHash = hashRefreshToken(refreshToken);
  const newRefreshToken = generateRefreshToken();
  const newHash = hashRefreshToken(newRefreshToken);

  const session = await authModel.rotateSession(
    oldHash,
    newHash
  );

  if (!session) {
    const error = new Error("Sesi berakhir. Silakan login kembali.");
    error.statusCode = 401;
    throw error;
  }

  const user = await authModel.findUserById(session.user_id);

  if (!user || !user.is_active) {
    await authModel.deleteSessionByRefreshTokenHash(newHash);

    const error = new Error("Akun tidak aktif atau tidak ditemukan");
    error.statusCode = 401;
    throw error;
  }

  const token = generateToken({
    user_id: user.id,
    role_id: user.role_id,
    role: user.role_name,
    sid: session.id,
  });

  return {
    token,
    access_token: token,
    refresh_token: newRefreshToken,
  };
}

async function logout(refreshToken) {
  if (
    typeof refreshToken === "string" &&
    /^[a-f0-9]{96}$/i.test(refreshToken)
  ) {
    await authModel.deleteSessionByRefreshTokenHash(
      hashRefreshToken(refreshToken)
    );
  }
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
      email: user.email,
      full_name: user.full_name,
      profile_photo: user.profile_photo,
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
  refresh,
  logout,
  me,
};