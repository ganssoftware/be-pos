
const userService = require("../services/userService");

const {
  isValidGmail,
  isValidPassword,
} = require("../utils/validation");

async function createOwner(req, res, next) {
  try {
    const { username, email, password, full_name } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "Username, password, dan nama lengkap wajib diisi",
      });
    }

    if (password.length < 6 || !isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password minimal 6 karakter, memiliki minimal 1 huruf besar dan 1 simbol",
      });
    }

    if (!email || !isValidGmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email wajib menggunakan @gmail.com",
      });
    }

    const owner = await userService.createOwner({
      username,
      email,
      password,
      full_name,
    });

    return res.status(201).json({
      success: true,
      message: "Owner berhasil dibuat",
      data: owner,
    });
  } catch (error) {
    next(error);
  }
}

async function createCashier(req, res, next) {
  try {
    const { username, email, password, full_name, store_ids } =
      req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({
        success: false,
        message: "Username, password, dan nama lengkap wajib diisi",
      });
    }

    if (password.length < 6 || !isValidPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Password minimal 6 karakter, memiliki minimal 1 huruf besar dan 1 simbol",
      });
    }

    if (!email || !isValidGmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email wajib menggunakan @gmail.com",
      });
    }

    if (store_ids !== undefined) {
      if (
        !Array.isArray(store_ids) ||
        store_ids.length !== 1 ||
        String(store_ids[0]).toLowerCase() !==
        String(req.storeId).toLowerCase()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Satu kasir hanya dapat ditugaskan ke satu toko aktif",
        });
      }
    }

    const cashier = await userService.createCashier(
      req.user.user_id,
      req.storeId,
      {
        username,
        email,
        password,
        full_name,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Kasir berhasil dibuat",
      data: cashier,
    });
  } catch (error) {
    next(error);
  }
}

async function getOwners(req, res, next) {
  try {
    const owners = await userService.getOwners();

    return res.status(200).json({
      success: true,
      message: "Data owner berhasil diambil",
      data: owners,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyCashiers(req, res, next) {
  try {
    const cashiers = await userService.getMyCashiers(
      req.user.user_id,
      req.storeId
    );

    return res.status(200).json({
      success: true,
      message: "Data kasir toko aktif berhasil diambil",
      data: cashiers,
    });
  } catch (error) {
    next(error);
  }
}

async function getAvailableCashiers(req, res, next) {
  try {
    const cashiers = await userService.getAvailableCashiers(
      req.user.user_id,
      req.storeId
    );

    return res.status(200).json({
      success: true,
      message: "Daftar kasir nonaktif yang dapat dipindahkan berhasil diambil",
      data: cashiers,
    });
  } catch (error) {
    next(error);
  }
}

async function moveCashier(req, res, next) {
  try {
    const { cashierId } = req.params;

    const cashier = await userService.moveCashier(
      req.user.user_id,
      cashierId,
      req.storeId
    );

    return res.status(200).json({
      success: true,
      message:
        "Kasir berhasil dipindahkan ke toko aktif dan akunnya diaktifkan",
      data: cashier,
    });
  } catch (error) {
    next(error);
  }
}

async function getAllUsers(req, res, next) {
  try {
    const users = await userService.getAllUsers();

    return res.status(200).json({
      success: true,
      message: "Data user berhasil diambil",
      data: users,
    });
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "is_active harus berupa boolean",
      });
    }

    const user = await userService.updateUserStatus(
      req.user.user_id,
      req.user.role,
      userId,
      is_active
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: is_active
        ? "Akun berhasil diaktifkan"
        : "Akun berhasil dinonaktifkan",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

async function updateMyProfile(req, res, next) {
  try {
    const {
      full_name,
      email,
      current_password,
      new_password,
    } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap wajib diisi",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email wajib diisi",
      });
    }

    if (!isValidGmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Email harus menggunakan @gmail.com",
      });
    }

    const user = await userService.updateMyProfile(
      req.user.user_id,
      {
        full_name: full_name.trim(),
        email: email.trim(),
        current_password,
        new_password,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Profil berhasil diperbarui",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

async function uploadMyProfilePhoto(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Foto profil wajib dipilih",
      });
    }

    const user = await userService.uploadProfilePhoto(
      req.user.user_id,
      req.file
    );

    return res.status(200).json({
      success: true,
      message: "Foto profil berhasil diperbarui",
      data: user,
    });
  } catch (error) {
    next(error);
  }
}

async function updateManagedUser(req, res, next) {
  try {
    const { full_name, email, new_password } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap wajib diisi",
      });
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email wajib diisi",
      });
    }

    if (!isValidGmail(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "Email harus menggunakan @gmail.com",
      });
    }

    const user = await userService.updateManagedUser(
      req.user.user_id,
      req.params.userId,
      {
        full_name: full_name.trim(),
        email: email.trim(),
        new_password,
      }
    );

    return res.status(200).json({
      success: true,
      message: "User berhasil diperbarui",
      data: user,
    });
  } catch (error) {
    next(error);
  }
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
  uploadMyProfilePhoto,
  updateManagedUser,
};
