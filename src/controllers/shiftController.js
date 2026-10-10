const shiftModel = require("../models/shiftModel");

function parseNonNegativeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

async function openShift(req, res) {
  try {
    const { schedule_id: scheduleId } = req.body;

    if (!scheduleId) {
      return res.status(400).json({
        success: false,
        message: "schedule_id wajib diisi",
      });
    }

    const shift = await shiftModel.openFromSchedule({
      scheduleId,
      storeId: req.storeId,
      userId: req.user.user_id,
    });

    return res.status(201).json({
      success: true,
      message: "Shift berhasil dibuka",
      data: shift,
    });
  } catch (error) {
    console.error("Open shift error:", error);

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Gagal membuka shift"
          : error.message,
    });
  }
}

async function getCurrentShift(req, res, next) {
  try {
    const shift =
      await shiftModel.findCurrentByUserId(
        req.user.user_id,
        req.storeId
      );

    return res.status(200).json({
      success: true,
      data: shift,
    });
  } catch (error) {
    next(error);
  }
}

async function getShifts(req, res, next) {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const status = String(
      req.query.status || ""
    )
      .trim()
      .toUpperCase();

    if (
      status &&
      !["OPEN", "CLOSED"].includes(status)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Status harus OPEN atau CLOSED",
      });
    }

    const userId =
      req.user.role === "owner"
        ? ""
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
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
}

async function closeShift(req, res) {
  try {
    const { closing_cash: closingCash } = req.body;

    if (
      closingCash === undefined ||
      closingCash === null ||
      closingCash === "" ||
      !Number.isFinite(Number(closingCash)) ||
      Number(closingCash) < 0
    ) {
      return res.status(400).json({
        success: false,
        message: "closing_cash harus berupa angka dan tidak boleh negatif",
      });
    }

    const shift = await shiftModel.findById(
      req.params.id,
      req.storeId
    );

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: "Shift tidak ditemukan",
      });
    }

    if (
      shift.user_id !== req.user.user_id &&
      req.user.role !== "owner"
    ) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke shift ini",
      });
    }

    const closedShift = await shiftModel.close(
      req.params.id,
      req.storeId,
      Number(closingCash)
    );

    if (!closedShift) {
      return res.status(409).json({
        success: false,
        message: "Shift sudah ditutup atau tidak dapat ditutup",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shift berhasil ditutup",
      data: closedShift,
    });
  } catch (error) {
    console.error("Close shift error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal menutup shift",
    });
  }
}

module.exports = {
  openShift,
  getCurrentShift,
  getShifts,
  closeShift,
};