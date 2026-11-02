const masterProductModel = require("../models/masterProductModel");

function cleanString(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const result = String(value).trim();

    return result || null;
}

function validateProduct(body) {
    const barcode = cleanString(body.barcode);
    const name = cleanString(body.name);

    if (!barcode) {
        const error = new Error("Barcode wajib diisi");
        error.statusCode = 400;
        throw error;
    }

    if (barcode.length > 100) {
        const error = new Error("Barcode maksimal 100 karakter");
        error.statusCode = 400;
        throw error;
    }

    if (!name) {
        const error = new Error("Nama produk wajib diisi");
        error.statusCode = 400;
        throw error;
    }

    if (name.length > 200) {
        const error = new Error("Nama produk maksimal 200 karakter");
        error.statusCode = 400;
        throw error;
    }

    const categoryName = cleanString(body.category_name);
    const unitName = cleanString(body.unit_name);
    const unitSymbol = cleanString(body.unit_symbol);

    if (categoryName && categoryName.length > 100) {
        const error = new Error("Nama kategori maksimal 100 karakter");
        error.statusCode = 400;
        throw error;
    }

    if (unitName && unitName.length > 50) {
        const error = new Error("Nama satuan maksimal 50 karakter");
        error.statusCode = 400;
        throw error;
    }

    if (unitSymbol && unitSymbol.length > 20) {
        const error = new Error("Simbol satuan maksimal 20 karakter");
        error.statusCode = 400;
        throw error;
    }

    return {
        barcode,
        name,
        description: cleanString(body.description),
        categoryName,
        unitName,
        unitSymbol,
        imageUrl: cleanString(body.image_url),
    };
}

function handleError(error, res, next) {
    if (error.code === "23505") {
        return res.status(409).json({
            success: false,
            message: "Barcode sudah terdaftar di Master Produk",
        });
    }

    if (error.statusCode) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message,
        });
    }

    return next(error);
}

async function getByBarcode(req, res, next) {
    try {
        const barcode = String(req.params.barcode || "").trim();

        if (!barcode) {
            return res.status(400).json({
                success: false,
                message: "Barcode wajib diisi",
            });
        }

        const product = await masterProductModel.findByBarcode(barcode);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Produk tidak ditemukan di Master Produk",
            });
        }

        return res.json({
            success: true,
            message: "Produk Master ditemukan",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

async function getAll(req, res, next) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 10, 1),
            100
        );

        const search = String(req.query.search || "").trim();

        const approvalStatus = req.query.status
            ? String(req.query.status).trim().toUpperCase()
            : null;

        const allowedStatuses = [
            "PENDING",
            "APPROVED",
            "REJECTED",
        ];

        if (
            approvalStatus &&
            !allowedStatuses.includes(approvalStatus)
        ) {
            return res.status(400).json({
                success: false,
                message: "Status Master Produk tidak valid",
            });
        }

        let isActive = null;

        if (req.query.is_active !== undefined) {
            if (
                req.query.is_active !== "true" &&
                req.query.is_active !== "false"
            ) {
                return res.status(400).json({
                    success: false,
                    message: "is_active harus true atau false",
                });
            }

            isActive = req.query.is_active === "true";
        }

        const result = await masterProductModel.findAll({
            page,
            limit,
            search,
            approvalStatus,
            isActive,
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

async function getPending(req, res, next) {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);

        const limit = Math.min(
            Math.max(Number(req.query.limit) || 10, 1),
            100
        );

        const search = String(req.query.search || "").trim();

        const result = await masterProductModel.findPending({
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

async function create(req, res, next) {
    try {
        const data = validateProduct(req.body);

        const product = await masterProductModel.create({
            ...data,
            reviewedBy: req.user.user_id,
        });

        return res.status(201).json({
            success: true,
            message: "Produk berhasil ditambahkan ke Master Produk",
            data: product,
        });
    } catch (error) {
        return handleError(error, res, next);
    }
}

async function submit(req, res, next) {
    try {
        const data = validateProduct(req.body);

        const product = await masterProductModel.submit({
            ...data,
            submittedBy: req.user.user_id,
        });

        return res.status(201).json({
            success: true,
            message: "Pengajuan produk berhasil dikirim ke Super Admin",
            data: product,
        });
    } catch (error) {
        return handleError(error, res, next);
    }
}

async function approve(req, res, next) {
    try {
        const product = await masterProductModel.approve(
            req.params.id,
            req.user.user_id
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Pengajuan tidak ditemukan atau sudah ditinjau",
            });
        }

        return res.json({
            success: true,
            message: "Produk berhasil disetujui dan masuk Master Produk",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

async function reject(req, res, next) {
    try {
        const reviewNote = cleanString(req.body.review_note);

        if (!reviewNote) {
            return res.status(400).json({
                success: false,
                message: "Alasan penolakan wajib diisi",
            });
        }

        const product = await masterProductModel.reject(
            req.params.id,
            req.user.user_id,
            reviewNote
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Pengajuan tidak ditemukan atau sudah ditinjau",
            });
        }

        return res.json({
            success: true,
            message: "Pengajuan produk berhasil ditolak",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

async function updateStatus(req, res, next) {
    try {
        if (typeof req.body.is_active !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "is_active harus berupa boolean",
            });
        }

        const product = await masterProductModel.updateStatus(
            req.params.id,
            req.body.is_active
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "Produk Master tidak ditemukan atau belum disetujui",
            });
        }

        return res.json({
            success: true,
            message: req.body.is_active
                ? "Produk Master berhasil diaktifkan"
                : "Produk Master berhasil dinonaktifkan",
            data: product,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getByBarcode,
    getAll,
    getPending,
    create,
    submit,
    approve,
    reject,
    updateStatus,
};
