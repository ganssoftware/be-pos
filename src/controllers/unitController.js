const unitModel = require("../models/unitModel");

async function getUnits(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const search = String(req.query.search || "").trim();

    const result = await unitModel.findAll(req.storeId, {
      page,
      limit,
      search,
    });

    return res.json({
      success: true,
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getUnitById(req, res, next) {
  try {
    const unit = await unitModel.findById(
      req.params.id,
      req.storeId
    );

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Satuan tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: unit,
    });
  } catch (error) {
    next(error);
  }
}

async function createUnit(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    const symbol = req.body.symbol
      ? String(req.body.symbol).trim()
      : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama satuan wajib diisi",
      });
    }

    const unit = await unitModel.create({
      storeId: req.storeId,
      name,
      symbol,
    });

    return res.status(201).json({
      success: true,
      message: "Satuan berhasil dibuat",
      data: unit,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Nama satuan sudah digunakan",
      });
    }

    next(error);
  }
}

async function updateUnit(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();

    const symbol = req.body.symbol
      ? String(req.body.symbol).trim()
      : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama satuan wajib diisi",
      });
    }

    const unit = await unitModel.update(
      req.params.id,
      req.storeId,
      {
        name,
        symbol,
      }
    );

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Satuan tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Satuan berhasil diperbarui",
      data: unit,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Nama satuan sudah digunakan",
      });
    }

    next(error);
  }
}

async function deleteUnit(req, res, next) {
  try {
    const unit = await unitModel.remove(
      req.params.id,
      req.storeId
    );

    if (!unit) {
      return res.status(404).json({
        success: false,
        message: "Satuan tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Satuan berhasil dihapus",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Satuan tidak dapat dihapus karena masih digunakan produk",
      });
    }

    next(error);
  }
}

module.exports = {
  getUnits,
  getUnitById,
  createUnit,
  updateUnit,
  deleteUnit,
};