const pool = require("../config/db");
const inventoryModel = require("../models/inventoryModel");

function parsePositiveNumber(value, fieldName) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        const error = new Error(
            `${fieldName} harus berupa angka lebih dari 0`
        );

        error.statusCode = 400;

        throw error;
    }

    return number;
}

function parseNonNegativeNumber(
    value,
    fieldName
) {
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

async function getInventory(req, res, next) {
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

        const search = String(
            req.query.search || ""
        ).trim();

        const lowStock =
            req.query.low_stock === "true";

        const result =
            await inventoryModel.findAll(
                req.storeId,
                {
                    page,
                    limit,
                    search,
                    lowStock,
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

async function getInventoryByProduct(
    req,
    res,
    next
) {
    try {
        const inventory =
            await inventoryModel.findByProductId(
                req.params.productId,
                req.storeId
            );

        if (!inventory) {
            return res.status(404).json({
                success: false,
                message: "Inventory tidak ditemukan",
            });
        }

        return res.json({
            success: true,
            data: inventory,
        });
    } catch (error) {
        next(error);
    }
}

async function stockIn(req, res, next) {
    const client = await pool.connect();

    try {
        const productId = req.body.product_id;

        const quantity = parsePositiveNumber(
            req.body.quantity,
            "Quantity"
        );

        const notes = req.body.notes
            ? String(req.body.notes).trim()
            : null;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID wajib diisi",
            });
        }

        await client.query("BEGIN");

        const product =
            await inventoryModel.findProductForUpdate(
                client,
                productId,
                req.storeId
            );

        if (!product) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan",
            });
        }

        if (!product.is_active) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message: "Produk tidak aktif",
            });
        }

        const inventory =
            await inventoryModel.getInventoryForUpdate(
                client,
                productId,
                req.storeId
            );

        if (!inventory) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Inventory produk tidak ditemukan",
            });
        }

        const updatedInventory =
            await inventoryModel.increaseStock(
                client,
                inventory.id,
                quantity
            );

        const movement =
            await inventoryModel.createMovement(
                client,
                {
                    storeId: req.storeId,
                    productId,
                    type: "IN",
                    quantity,
                    referenceType: "MANUAL",
                    notes,
                    createdBy: req.user.user_id,
                }
            );

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: "Stok berhasil ditambahkan",
            data: {
                inventory: updatedInventory,
                movement,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        next(error);
    } finally {
        client.release();
    }
}

async function adjustment(req, res, next) {
    const client = await pool.connect();

    try {
        const productId = req.body.product_id;

        const newQuantity = parseNonNegativeNumber(
            req.body.quantity,
            "Quantity"
        );

        const notes = req.body.notes
            ? String(req.body.notes).trim()
            : null;

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID wajib diisi",
            });
        }

        await client.query("BEGIN");

        const product =
            await inventoryModel.findProductForUpdate(
                client,
                productId,
                req.storeId
            );

        if (!product) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan",
            });
        }

        const inventory =
            await inventoryModel.getInventoryForUpdate(
                client,
                productId,
                req.storeId
            );

        if (!inventory) {
            await client.query("ROLLBACK");

            return res.status(404).json({
                success: false,
                message: "Inventory produk tidak ditemukan",
            });
        }

        const oldQuantity = Number(
            inventory.quantity
        );

        const difference =
            newQuantity - oldQuantity;

        // Tidak ada perubahan stok.
        if (difference === 0) {
            await client.query("ROLLBACK");

            return res.status(400).json({
                success: false,
                message:
                    "Quantity baru sama dengan stok saat ini",
            });
        }

        const updatedInventory =
            await inventoryModel.setStock(
                client,
                inventory.id,
                newQuantity
            );

        const direction =
            difference > 0 ? "+" : "";

        const movementNotes =
            notes ||
            `Adjustment ${direction}${difference}, dari ${oldQuantity} menjadi ${newQuantity}`;

        const movement =
            await inventoryModel.createMovement(
                client,
                {
                    storeId: req.storeId,
                    productId,
                    type: "ADJUSTMENT",

                    // Movement quantity selalu positif.
                    quantity: Math.abs(difference),

                    referenceType: "MANUAL",

                    notes: movementNotes,

                    createdBy: req.user.user_id,
                }
            );

        await client.query("COMMIT");

        return res.status(201).json({
            success: true,
            message: "Stok berhasil disesuaikan",
            data: {
                old_quantity: oldQuantity,
                new_quantity: newQuantity,
                difference,
                inventory: updatedInventory,
                movement,
            },
        });
    } catch (error) {
        await client.query("ROLLBACK");

        if (error.statusCode) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
            });
        }

        next(error);
    } finally {
        client.release();
    }
}

async function getMovements(req, res, next) {
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

        const productId =
            req.query.product_id || null;

        const type =
            req.query.type || null;

        const allowedTypes = [
            "IN",
            "OUT",
            "ADJUSTMENT",
        ];

        if (
            type &&
            !allowedTypes.includes(type)
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Type harus IN, OUT, atau ADJUSTMENT",
            });
        }

        const result =
            await inventoryModel.findMovements(
                req.storeId,
                {
                    page,
                    limit,
                    productId,
                    type,
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

module.exports = {
    getInventory,
    getInventoryByProduct,
    stockIn,
    adjustment,
    getMovements,
};