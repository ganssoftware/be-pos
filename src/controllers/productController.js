const productModel = require("../models/productModel");
const categoryModel = require("../models/categoryModel");
const unitModel = require("../models/unitModel");
const inventoryModel = require("../models/inventoryModel");

const pool = require("../config/db");
const supabaseAdmin = require("../config/supabase");

function parseNonNegativeNumber(value, fieldName) {
  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(
      `${fieldName} harus berupa angka >= 0`
    );

    error.statusCode = 400;
    throw error;
  }

  return number;
}

function cleanString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const result = String(value).trim();

  return result || null;
}

async function resolveCategory(
  client,
  storeId,
  categoryId,
  categoryName
) {
  if (categoryId) {
    const result = await client.query(
      `
        SELECT id
        FROM categories
        WHERE id = $1
          AND store_id = $2
        LIMIT 1
      `,
      [categoryId, storeId]
    );

    if (!result.rows[0]) {
      const error = new Error(
        "Kategori tidak ditemukan pada store ini"
      );

      error.statusCode = 400;
      throw error;
    }

    return result.rows[0].id;
  }

  if (!categoryName) {
    return null;
  }

  const category = await categoryModel.findOrCreate(
    client,
    storeId,
    categoryName
  );

  return category.id;
}

async function resolveUnit(
  client,
  storeId,
  unitId,
  unitName,
  unitSymbol
) {
  if (unitId) {
    const result = await client.query(
      `
        SELECT id
        FROM units
        WHERE id = $1
          AND store_id = $2
        LIMIT 1
      `,
      [unitId, storeId]
    );

    if (!result.rows[0]) {
      const error = new Error(
        "Satuan tidak ditemukan pada store ini"
      );

      error.statusCode = 400;
      throw error;
    }

    return result.rows[0].id;
  }

  if (!unitName) {
    return null;
  }

  const unit = await unitModel.findOrCreate(
    client,
    storeId,
    unitName,
    unitSymbol
  );

  return unit.id;
}

function validateProductData(body) {
  const sku = cleanString(body.sku);
  const name = cleanString(body.name);

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

    barcode: cleanString(body.barcode),

    description: cleanString(body.description),

    categoryId: cleanString(body.category_id),

    categoryName: cleanString(body.category_name),

    unitId: cleanString(body.unit_id),

    unitName: cleanString(body.unit_name),

    unitSymbol: cleanString(body.unit_symbol),

    purchasePrice,

    sellingPrice,

    minimumStock,

    imageUrl: cleanString(body.image_url),
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
        message:
          "Produk dengan barcode tersebut tidak ditemukan",
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

async function getNextSku(req, res, next) {
  try {
    const sku = await productModel.getNextSku(
      req.storeId
    );

    return res.json({
      success: true,
      message: "SKU berikutnya berhasil dibuat",
      data: {
        sku,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  let client;
  let transactionStarted = false;

  try {
    const data = validateProductData(req.body);

    const initialStock = Number(
      req.body.initial_stock ?? 0
    );

    if (
      !Number.isFinite(initialStock) ||
      initialStock < 0
    ) {
      const error = new Error(
        "Stok awal harus berupa angka >= 0"
      );

      error.statusCode = 400;
      throw error;
    }

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const categoryId = await resolveCategory(
      client,
      req.storeId,
      data.categoryId,
      data.categoryName
    );

    const unitId = await resolveUnit(
      client,
      req.storeId,
      data.unitId,
      data.unitName,
      data.unitSymbol
    );

    const product = await productModel.create(
      {
        storeId: req.storeId,
        ...data,
        categoryId,
        unitId,
      },
      client
    );

    const inventoryResult = await client.query(
      `
        INSERT INTO inventory (
          store_id,
          product_id,
          quantity
        )
        VALUES ($1, $2, $3)

        ON CONFLICT (store_id, product_id)
        DO UPDATE SET
          quantity = EXCLUDED.quantity,
          updated_at = NOW()

        RETURNING *
      `,
      [
        req.storeId,
        product.id,
        initialStock,
      ]
    );

    let movement = null;

    if (initialStock > 0) {
      movement = await inventoryModel.createMovement(
        client,
        {
          storeId: req.storeId,
          productId: product.id,
          type: "IN",
          quantity: initialStock,
          referenceType: "INITIAL_STOCK",
          notes: "Stok awal saat produk dibuat",
          createdBy: req.user.user_id,
        }
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(201).json({
      success: true,
      message: "Produk berhasil dibuat",
      data: {
        ...product,
        category_id: categoryId,
        unit_id: unitId,
        stock: inventoryResult.rows[0].quantity,
      },
      stock_movement: movement,
    });
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Rollback createProduct gagal:",
          rollbackError
        );
      }
    }

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

    return next(error);
  } finally {
    if (client) {
      client.release();
    }
  }
}

const uploadProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const storeId = req.storeId;

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

    if (!extension) {
      return res.status(400).json({
        success: false,
        message: "Format foto tidak didukung",
      });
    }

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
      await productModel.updateImage(
        id,
        storeId,
        imageUrl
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
  let client;
  let transactionStarted = false;

  try {
    const data = validateProductData(req.body);

    const isActive =
      req.body.is_active === undefined
        ? true
        : req.body.is_active === true ||
          req.body.is_active === "true";

    client = await pool.connect();

    await client.query("BEGIN");
    transactionStarted = true;

    const categoryId = await resolveCategory(
      client,
      req.storeId,
      data.categoryId,
      data.categoryName
    );

    const unitId = await resolveUnit(
      client,
      req.storeId,
      data.unitId,
      data.unitName,
      data.unitSymbol
    );

    const product = await productModel.update(
      req.params.id,
      req.storeId,
      {
        ...data,
        categoryId,
        unitId,
        isActive,
      },
      client
    );

    if (!product) {
      const error = new Error(
        "Produk tidak ditemukan"
      );

      error.statusCode = 404;
      throw error;
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.json({
      success: true,
      message: "Produk berhasil diperbarui",
      data: product,
    });
  } catch (error) {
    if (transactionStarted && client) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error(
          "Rollback updateProduct gagal:",
          rollbackError
        );
      }
    }

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

    return next(error);
  } finally {
    if (client) {
      client.release();
    }
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
        message:
          "Produk tidak ditemukan atau sudah tidak aktif",
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
  getNextSku,
  createProduct,
  uploadProductImage,
  updateProduct,
  deleteProduct,
};
