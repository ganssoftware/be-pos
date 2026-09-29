const categoryModel = require("../models/categoryModel");

async function getCategories(req, res, next) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const search = String(req.query.search || "").trim();

    const result = await categoryModel.findAll(req.storeId, {
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

async function getCategoryById(req, res, next) {
  try {
    const category = await categoryModel.findById(
      req.params.id,
      req.storeId
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: category,
    });
  } catch (error) {
    next(error);
  }
}

async function createCategory(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    const description = req.body.description
      ? String(req.body.description).trim()
      : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori wajib diisi",
      });
    }

    const category = await categoryModel.create({
      storeId: req.storeId,
      name,
      description,
    });

    return res.status(201).json({
      success: true,
      message: "Kategori berhasil dibuat",
      data: category,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Nama kategori sudah digunakan",
      });
    }

    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama kategori wajib diisi",
      });
    }

    const category = await categoryModel.update(
      req.params.id,
      req.storeId,
      {
        name,
        description: req.body.description,
        is_active:
          req.body.is_active === undefined
            ? true
            : Boolean(req.body.is_active),
      }
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Kategori berhasil diperbarui",
      data: category,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Nama kategori sudah digunakan",
      });
    }

    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const category = await categoryModel.remove(
      req.params.id,
      req.storeId
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Kategori tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Kategori berhasil dihapus",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Kategori tidak dapat dihapus karena masih digunakan produk",
      });
    }

    next(error);
  }
}

module.exports = {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
};