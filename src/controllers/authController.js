const authService = require("../services/authService");

async function login(req, res, next) {
  try {
    const { username, password } = req.body;

    console.log("=== LOGIN DEBUG ===");
    console.log("username:", username);
    console.log("password exists:", !!password);
    console.log("===================");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username dan password wajib diisi",
      });
    }

    const result = await authService.login(
      username,
      password
    );

    return res.status(200).json({
      success: true,
      message: "Login berhasil",
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.me(
      req.user.user_id
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  login,
  me,
};
