const customerModel = require("../models/customerModel");

function normalizeString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed === "" ? null : trimmed;
}

function validateEmail(email) {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function getCustomers(req, res, next) {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 10, 1),
      100
    );

    const search = String(
      req.query.search || ""
    ).trim();

    const result = await customerModel.findAll(
      req.storeId,
      {
        page,
        limit,
        search,
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

async function getCustomerById(req, res, next) {
  try {
    const { id } = req.params;

    const customer = await customerModel.findById(
      id,
      req.storeId
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

async function createCustomer(req, res, next) {
  try {
    const name = normalizeString(req.body.name);
    const phone = normalizeString(req.body.phone);
    const email = normalizeString(req.body.email);
    const address = normalizeString(req.body.address);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama customer wajib diisi",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    const customer = await customerModel.create({
      storeId: req.storeId,
      name,
      phone,
      email,
      address,
    });

    return res.status(201).json({
      success: true,
      message: "Customer berhasil ditambahkan",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

async function updateCustomer(req, res, next) {
  try {
    const { id } = req.params;

    const name = normalizeString(req.body.name);
    const phone = normalizeString(req.body.phone);
    const email = normalizeString(req.body.email);
    const address = normalizeString(req.body.address);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama customer wajib diisi",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    const customer = await customerModel.update(
      id,
      req.storeId,
      {
        name,
        phone,
        email,
        address,
      }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer berhasil diperbarui",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
}

async function deleteCustomer(req, res, next) {
  try {
    const { id } = req.params;

    const customer = await customerModel.remove(
      id,
      req.storeId
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer berhasil dihapus",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Customer tidak dapat dihapus karena sudah digunakan dalam transaksi",
      });
    }

    next(error);
  }
}

module.exports = {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};