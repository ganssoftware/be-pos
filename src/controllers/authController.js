const authService = require("../services/authService");

async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi",
      });
    }

    const result = await authService.login(
      username.trim(),
      password
    );

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: result,
    });
  } catch (error) {
    if (error.message === "Username atau password salah") {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Akun tidak aktif") {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

async function refresh(req, res, next) {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token wajib diisi",
      });
    }

    const result = await authService.refresh(refresh_token);

    return res.status(200).json({
      success: true,
      message: "Token berhasil diperbarui",
      data: result,
    });
  } catch (error) {
    if (error.statusCode === 401) {
      return res.status(401).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

async function logout(req, res, next) {
  try {
    const { refresh_token } = req.body;

    await authService.logout(refresh_token);

    return res.status(200).json({
      success: true,
      message: "Logout berhasil",
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.me(req.user.user_id);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.message === "User tidak ditemukan") {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message === "Akun tidak aktif") {
      return res.status(403).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
};