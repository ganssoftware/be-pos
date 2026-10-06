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

module.exports = {
  getMyStores,
  createStore,
};