const shiftModel = require("../models/shiftModel");

function normalizeRole(role) {
  if (typeof role === "string") {
    return role.trim().toLowerCase();
  }

  if (role && typeof role === "object") {
    return String(role.name || "")
      .trim()
      .toLowerCase();
  }

  return "";
}

function parseNonNegativeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

async function openShift(req, res) {
  try {
    const { schedule_id } = req.body;

    if (!schedule_id) {
      return res.status(400).json({
        message: "Schedule ID wajib diisi",
      });
    }

    const shift = await shiftModel.openFromSchedule({
      scheduleId: schedule_id,
      storeId: req.storeId,
      userId: req.user.user_id,
    });

    return res.status(201).json({
      message: "Shift berhasil dibuka",
      data: shift,
    });

  } catch (error) {
    console.error("Open shift error:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Terjadi kesalahan saat membuka shift",
    });
  }
}

async function getCurrentShift(req, res) {
  try {
    const shift = await shiftModel.findCurrentByUserId(
      req.user.user_id,
      req.storeId
    );

    return res.status(200).json({
      message: "Berhasil mengambil shift aktif",
      data: shift,
    });

  } catch (error) {
    console.error("Get current shift error:", error);

    return res.status(500).json({
      message: "Gagal mengambil shift aktif",
    });
  }
}

async function getShifts(req, res) {
  try {
    const role = normalizeRole(req.user.role);

    const page = Math.max(
      1,
      Number.parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        Number.parseInt(req.query.limit, 10) || 20
      )
    );

    const status = String(
      req.query.status || ""
    ).trim().toUpperCase();

    if (status && !["OPEN", "CLOSED"].includes(status)) {
      return res.status(400).json({
        message: "Status shift tidak valid",
      });
    }

    const userId =
      role === "owner"
        ? String(req.query.user_id || "").trim()
        : req.user.user_id;

    const result = await shiftModel.findAll(
      req.storeId,
      {
        page,
        limit,
        status,
        userId,
      }
    );

    return res.status(200).json({
      message: "Berhasil mengambil data shift",
      ...result,
    });

  } catch (error) {
    console.error("Get shifts error:", error);

    return res.status(500).json({
      message: "Gagal mengambil data shift",
    });
  }
}

async function closeShift(req, res) {
  try {
    const { id } = req.params;
    const { closing_cash } = req.body;

    const closingCash = parseNonNegativeNumber(
      closing_cash
    );

    if (closingCash === null) {
      return res.status(400).json({
        message: "Closing cash harus berupa angka positif atau nol",
      });
    }

    const shift = await shiftModel.findById(
      id,
      req.storeId
    );

    if (!shift) {
      return res.status(404).json({
        message: "Shift tidak ditemukan",
      });
    }

    const role = normalizeRole(req.user.role);

    const isOwner = role === "owner";

    const isOwnShift =
      shift.user_id === req.user.user_id;

    if (!isOwner && !isOwnShift) {
      return res.status(403).json({
        message: "Anda tidak memiliki akses untuk menutup shift ini",
      });
    }

    const result = await shiftModel.close(
      id,
      req.storeId,
      closingCash
    );

    if (!result) {
      return res.status(409).json({
        message: "Shift tidak ditemukan atau sudah ditutup",
      });
    }

    return res.status(200).json({
      message: "Shift berhasil ditutup",
      data: result,
    });

  } catch (error) {
    console.error("Close shift error:", error);

    return res.status(error.statusCode || 500).json({
      message:
        error.statusCode
          ? error.message
          : "Terjadi kesalahan saat menutup shift",
    });
  }
}

module.exports = {
  openShift,
  getCurrentShift,
  getShifts,
  closeShift,
};
