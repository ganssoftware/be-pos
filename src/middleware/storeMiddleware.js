const storeModel = require("../models/storeModel");

async function storeMiddleware(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const storeId =
      req.params.storeId ||
      req.body.store_id ||
      req.query.store_id ||
      req.headers["x-store-id"];

    if (!storeId) {
      return res.status(400).json({
        success: false,
        message: "Store ID wajib diisi",
      });
    }

    const hasAccess = await storeModel.userHasStoreAccess(
      req.user.user_id,
      storeId
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Anda tidak memiliki akses ke store ini",
      });
    }

    req.storeId = storeId;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = storeMiddleware;