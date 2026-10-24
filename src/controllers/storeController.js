
const storeModel = require("../models/storeModel");
const storeService = require("../services/storeService");

function normalizeOptionalText(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const text = String(value).trim();
    return text || null;
}

async function getMyStores(req, res, next) {
    try {
        const stores = await storeModel.findStoresByUserId(
            req.user.user_id
        );

        return res.status(200).json({
            success: true,
            message: "Data toko berhasil diambil",
            data: stores,
        });
    } catch (error) {
        return next(error);
    }
}

async function createStore(req, res, next) {
    try {
        const name = normalizeOptionalText(req.body.name);

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nama toko wajib diisi",
            });
        }

        const store = await storeService.createStore(
            req.user.user_id,
            {
                name,
                address: normalizeOptionalText(req.body.address),
                phone: normalizeOptionalText(req.body.phone),
            },
            req.file || null
        );

        return res.status(201).json({
            success: true,
            message: "Toko berhasil dibuat",
            data: store,
        });
    } catch (error) {
        return next(error);
    }
}

async function updateStore(req, res, next) {
    try {
        const name = normalizeOptionalText(req.body.name);

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nama toko wajib diisi",
            });
        }

        const store = await storeService.updateStore(
            req.user.user_id,
            req.params.storeId,
            {
                name,
                address: normalizeOptionalText(req.body.address),
                phone: normalizeOptionalText(req.body.phone),
            },
            req.file || null
        );

        return res.status(200).json({
            success: true,
            message: "Toko berhasil diperbarui",
            data: store,
        });
    } catch (error) {
        return next(error);
    }
}

async function uploadStoreImage(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Foto toko wajib dipilih",
            });
        }

        const store = await storeService.uploadStoreImage(
            req.user.user_id,
            req.params.storeId,
            req.file
        );

        return res.status(200).json({
            success: true,
            message: "Foto toko berhasil diperbarui",
            data: store,
        });
    } catch (error) {
        return next(error);
    }
}

async function getOpeningCashSetting(req, res, next) {
    try {
        const setting = await storeModel.getOpeningCashSetting(
            req.storeId
        );

        if (!setting) {
            return res.status(404).json({
                success: false,
                message: "Toko tidak ditemukan",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Pengaturan modal awal berhasil diambil",
            data: setting,
        });
    } catch (error) {
        return next(error);
    }
}

async function updateOpeningCashSetting(req, res, next) {
    try {
        const { opening_cash_enabled } = req.body;

        if (typeof opening_cash_enabled !== "boolean") {
            return res.status(400).json({
                success: false,
                message:
                    "opening_cash_enabled harus berupa boolean true atau false",
            });
        }

        const setting = await storeModel.updateOpeningCashSetting(
            req.storeId,
            opening_cash_enabled
        );

        if (!setting) {
            return res.status(404).json({
                success: false,
                message: "Toko tidak ditemukan",
            });
        }

        return res.status(200).json({
            success: true,
            message: opening_cash_enabled
                ? "Fitur modal awal berhasil diaktifkan"
                : "Fitur modal awal berhasil dinonaktifkan",
            data: setting,
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    getMyStores,
    createStore,
    updateStore,
    uploadStoreImage,
    getOpeningCashSetting,
    updateOpeningCashSetting,
};
