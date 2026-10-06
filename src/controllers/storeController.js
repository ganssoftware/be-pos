const storeModel = require("../models/storeModel");
const storeService = require("../services/storeService");

async function getMyStores(req, res, next) {
  try {
    const userId = req.user.user_id;

    const stores = await storeModel.findStoresByUserId(userId);

    return res.status(200).json({
      success: true,
      message: "Data toko berhasil diambil",
      data: stores,
    });
  } catch (error) {
    next(error);
  }
}

async function createStore(req, res, next) {
  try {
    const { name, code, address, phone } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: "Nama toko dan kode toko wajib diisi",
      });
    }

    const store = await storeService.createStore(
      req.user.user_id,
      {
        name,
        code,
        address,
        phone,
      }
    );

    return res.status(201).json({
      success: true,
      message: "Toko berhasil dibuat",
      data: store,
    });
  } catch (error) {
    next(error);
  }
}

async function updateStore(
  req,
  res,
  next
) {
  try {
    const {
      name,
      code,
      address,
      phone,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Nama toko wajib diisi",
      });
    }

    if (!code || !code.trim()) {
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
          name: name.trim(),
          code: code.trim(),
          address:
            address?.trim() || null,
          phone:
            phone?.trim() || null,
        }
      );

    return res.status(200).json({
      success: true,
      message: "Toko berhasil diperbarui",
      data: store,
    });
  } catch (error) {
    next(error);
  }
}

async function uploadStoreImage(
  req,
  res,
  next
) {
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
      message:
        "Foto toko berhasil diperbarui",
      data: store,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyStores,
  createStore,
  updateStore,
  uploadStoreImage,
};