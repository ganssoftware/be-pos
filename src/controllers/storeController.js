
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
        const stores =
            await storeModel.findStoresByUserId(
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
        const name = normalizeOptionalText(
            req.body.name
        );

        const code = normalizeOptionalText(
            req.body.code
        );

        if (!name || !code) {
            return res.status(400).json({
                success: false,
                message:
                    "Nama toko dan kode toko wajib diisi",
            });
        }

        const store =
            await storeService.createStore(
                req.user.user_id,
                {
                    name,
                    code,
                    address: normalizeOptionalText(
                        req.body.address
                    ),
                    phone: normalizeOptionalText(
                        req.body.phone
                    ),
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
        const name = normalizeOptionalText(
            req.body.name
        );

        const code = normalizeOptionalText(
            req.body.code
        );

        if (!name) {
            return res.status(400).json({
                success: false,
                message: "Nama toko wajib diisi",
            });
        }

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Kode toko wajib diisi",
            });
        }

        const store =
            await storeService.updateStore(
                req.user.user_id,
                req.params.storeId,
                {
                    name,
                    code,
                    address: normalizeOptionalText(
                        req.body.address
                    ),
                    phone: normalizeOptionalText(
                        req.body.phone
                    ),
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

        const store =
            await storeService.uploadStoreImage(
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

module.exports = {
    getMyStores,
    createStore,
    updateStore,
    uploadStoreImage,
};
