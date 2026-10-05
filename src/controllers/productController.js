const productModel = require("../models/productModel");
const pool = require("../config/db");
const { supabaseAdmin } = require("../config/supabase");

function parseNonNegativeNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${fieldName} harus berupa angka >= 0`);
  }

  return number;
}

async function validateCategory(storeId, categoryId) {
  if (!categoryId) {
    return;
  }

  const query = `
    SELECT id
    FROM categories
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [
    categoryId,
    storeId,
  ]);

  if (!result.rows[0]) {
    const error = new Error(
      "Kategori tidak ditemukan pada store ini"
    );

    error.statusCode = 400;

    throw error;
  }
}

async function validateUnit(storeId, unitId) {
  if (!unitId) {
    return;
  }

  const query = `
    SELECT id
    FROM units
    WHERE id = $1
      AND store_id = $2
    LIMIT 1
  `;

  const result = await pool.query(query, [
    unitId,
    storeId,
  ]);

  if (!result.rows[0]) {
    const error = new Error(
      "Satuan tidak ditemukan pada store ini"
    );

    error.statusCode = 400;

    throw error;
  }
}

function validateProductData(body) {
  const sku = String(body.sku || "").trim();
  const name = String(body.name || "").trim();

  if (!sku) {
    const error = new Error("SKU wajib diisi");
    error.statusCode = 400;
    throw error;
  }

  if (!name) {
    const error = new Error("Nama produk wajib diisi");
    error.statusCode = 400;
    throw error;
  }

  const purchasePrice = parseNonNegativeNumber(
    body.purchase_price ?? 0,
    "Harga beli"
  );

  const sellingPrice = parseNonNegativeNumber(
    body.selling_price ?? 0,
    "Harga jual"
  );

  const minimumStock = parseNonNegativeNumber(
    body.minimum_stock ?? 0,
    "Minimum stock"
  );

  return {
    sku,
    name,
    barcode: body.barcode
      ? String(body.barcode).trim()
      : null,

    description: body.description
      ? String(body.description).trim()
      : null,

    categoryId: body.category_id || null,
    unitId: body.unit_id || null,

    purchasePrice,
    sellingPrice,
    minimumStock,

    imageUrl: body.image_url
      ? String(body.image_url).trim()
      : null,
  };
}

async function getProducts(req, res, next) {
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

    const categoryId =
      req.query.category_id || null;

    const result = await productModel.findAll(
      req.storeId,
      {
        page,
        limit,
        search,
        categoryId,
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

async function getProductById(req, res, next) {
  try {
    const product = await productModel.findById(
      req.params.id,
      req.storeId
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function getProductByBarcode(req, res, next) {
  try {
    const barcode = String(
      req.params.barcode || ""
    ).trim();

    if (!barcode) {
      return res.status(400).json({
        success: false,
        message: "Barcode wajib diisi",
      });
    }

    const product =
      await productModel.findByBarcode(
        barcode,
        req.storeId
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Produk dengan barcode tersebut tidak ditemukan",
      });
    }

    if (!product.is_active) {
      return res.status(400).json({
        success: false,
        message: "Produk tidak aktif",
      });
    }

    return res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const data = validateProductData(req.body);

    await validateCategory(
      req.storeId,
      data.categoryId
    );

    await validateUnit(
      req.storeId,
      data.unitId
    );

    const product = await productModel.create({
      storeId: req.storeId,
      ...data,
    });

    // Buat inventory awal dengan stock 0.
    await pool.query(
      `
        INSERT INTO inventory (
          store_id,
          product_id,
          quantity
        )
        VALUES ($1, $2, 0)
        ON CONFLICT (store_id, product_id)
        DO NOTHING
      `,
      [
        req.storeId,
        product.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Produk berhasil dibuat",
      data: product,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "SKU atau barcode sudah digunakan pada store ini",
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

const uploadProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.store.id;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Foto produk wajib dipilih",
      });
    }

    const product = await productModel.findById(
      id,
      storeId
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan",
      });
    }

    const extensionMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };

    const extension =
      extensionMap[req.file.mimetype];

    const fileName =
      `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}.${extension}`;

    const filePath =
      `${storeId}/products/${id}/${fileName}`;

    const { error: uploadError } =
      await supabaseAdmin.storage
        .from("product-images")
        .upload(
          filePath,
          req.file.buffer,
          {
            contentType: req.file.mimetype,
            upsert: false,
          }
        );

    if (uploadError) {
      console.error(
        "Supabase product image upload error:",
        uploadError
      );

      return res.status(500).json({
        success: false,
        message: "Gagal upload foto produk",
      });
    }

    const {
      data: publicUrlData,
    } = supabaseAdmin.storage
      .from("product-images")
      .getPublicUrl(filePath);

    const imageUrl =
      publicUrlData.publicUrl;

    const updatedProduct =
      await productModel.update(
        id,
        storeId,
        {
          category_id: product.category_id,
          unit_id: product.unit_id,
          sku: product.sku,
          barcode: product.barcode,
          name: product.name,
          description: product.description,
          purchase_price:
            product.purchase_price,
          selling_price:
            product.selling_price,
          minimum_stock:
            product.minimum_stock,
          image_url: imageUrl,
          is_active: product.is_active,
        }
      );

    return res.json({
      success: true,
      message: "Foto produk berhasil diupload",
      data: updatedProduct,
    });
  } catch (error) {
    console.error(
      "uploadProductImage:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Gagal upload foto produk",
    });
  }
};

async function updateProduct(req, res, next) {
  try {
    const data = validateProductData(req.body);

    await validateCategory(
      req.storeId,
      data.categoryId
    );

    await validateUnit(
      req.storeId,
      data.unitId
    );

    const isActive =
      req.body.is_active === undefined
        ? true
        : Boolean(req.body.is_active);

    const product =
      await productModel.update(
        req.params.id,
        req.storeId,
        {
          ...data,
          isActive,
        }
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Produk berhasil diperbarui",
      data: product,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "SKU atau barcode sudah digunakan pada store ini",
      });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    next(error);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    const product = await productModel.deactivate(
      id,
      req.storeId
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan atau sudah tidak aktif",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Produk berhasil dinonaktifkan",
      data: product,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getProducts,
  getProductById,
  getProductByBarcode,
  createProduct,
  uploadProductImage,
  updateProduct,
  deleteProduct,
};