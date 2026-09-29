const shiftModel = require("../models/shiftModel");

function parseNonNegativeNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return number;
}

async function openShift(req, res, next) {
  try {
    const openingCash = parseNonNegativeNumber(
      req.body.opening_cash
    );

    if (openingCash === null) {
      return res.status(400).json({
        success: false,
        message:
          "Opening cash harus berupa angka >= 0",
      });
    }

    const existingShift =
      await shiftModel.findCurrentByUserId(
        req.user.user_id,
        req.storeId
      );

    if (existingShift) {
      return res.status(409).json({
        success: false,
        message:
          "Anda masih memiliki shift yang sedang terbuka",
        data: existingShift,
      });
    }

    try {
      const shift = await shiftModel.create({
        storeId: req.storeId,
        userId: req.user.user_id,
        openingCash,
      });

      return res.status(201).json({
        success: true,
        message: "Shift berhasil dibuka",
        data: shift,
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message:
            "Anda masih memiliki shift yang sedang terbuka",
        });
      }

      throw error;
    }
  } catch (error) {
    next(error);
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

    const result = await shiftModel.findAll(
      req.storeId,
      {
        page,
        limit,
        status,
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

async function closeShift(req, res, next) {
  try {
    const { id } = req.params;

    const closingCash = parseNonNegativeNumber(
      req.body.closing_cash
    );

    if (closingCash === null) {
      return res.status(400).json({
        success: false,
        message:
          "Closing cash harus berupa angka >= 0",
      });
    }

    const shift =
      await shiftModel.findById(
        id,
        req.storeId
      );

    if (!shift) {
      return res.status(404).json({
        success: false,
        message: "Shift tidak ditemukan",
      });
    }

    if (shift.status !== "OPEN") {
      return res.status(409).json({
        success: false,
        message: "Shift sudah ditutup",
      });
    }

    if (
      shift.user_id !== req.user.user_id &&
      req.user.role !== "owner"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Anda tidak dapat menutup shift kasir lain",
      });
    }

    const closedShift =
      await shiftModel.close(
        id,
        req.storeId,
        closingCash
      );

    if (!closedShift) {
      return res.status(409).json({
        success: false,
        message:
          "Shift gagal ditutup atau sudah ditutup",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Shift berhasil ditutup",
      data: closedShift,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  openShift,
  getCurrentShift,
  getShifts,
  closeShift,
};