const storeModel = require("../models/storeModel");

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

module.exports = {
  getMyStores,
};