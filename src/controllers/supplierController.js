const supplierModel =
  require("../models/supplierModel");

function getSupplierData(body) {
  const name = String(
    body.name || ""
  ).trim();

  const phone = body.phone
    ? String(body.phone).trim()
    : null;

  const email = body.email
    ? String(body.email).trim()
    : null;

  const address = body.address
    ? String(body.address).trim()
    : null;

  if (!name) {
    const error = new Error(
      "Nama supplier wajib diisi"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  ) {
    const error = new Error(
      "Format email tidak valid"
    );

    error.statusCode = 400;

    throw error;
  }

  return {
    name,
    phone,
    email,
    address,
  };
}

async function getSuppliers(
  req,
  res,
  next
) {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 10,
        1
      ),
      100
    );

    const search = String(
      req.query.search || ""
    ).trim();

    const result =
      await supplierModel.findAll(
        req.storeId,
        {
          page,
          limit,
          search,
        }
      );

    return res.json({
      success: true,
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        total_pages: Math.ceil(
          result.total / limit
        ),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getSupplierById(
  req,
  res,
  next
) {
  try {
    const supplier =
      await supplierModel.findById(
        req.params.id,
        req.storeId
      );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    next(error);
  }
}

async function createSupplier(
  req,
  res,
  next
) {
  try {
    const data =
      getSupplierData(req.body);

    const supplier =
      await supplierModel.create({
        storeId: req.storeId,
        ...data,
      });

    return res.status(201).json({
      success: true,
      message: "Supplier berhasil dibuat",
      data: supplier,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(
        error.statusCode
      ).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

async function updateSupplier(
  req,
  res,
  next
) {
  try {
    const data =
      getSupplierData(req.body);

    const supplier =
      await supplierModel.update(
        req.params.id,
        req.storeId,
        data
      );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message:
        "Supplier berhasil diperbarui",
      data: supplier,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(
        error.statusCode
      ).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

async function deleteSupplier(
  req,
  res,
  next
) {
  try {
    const supplier =
      await supplierModel.remove(
        req.params.id,
        req.storeId
      );

    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message:
        "Supplier berhasil dihapus",
    });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(409).json({
        success: false,
        message:
          "Supplier tidak dapat dihapus karena masih digunakan",
      });
    }

    next(error);
  }
}

module.exports = {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};