
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");
const upload = require("../middleware/uploadImage");
const storeController = require("../controllers/storeController");

router.use(authMiddleware);

router.get(
    "/",
    storeController.getMyStores
);

router.post(
    "/",
    roleMiddleware("owner"),
    upload.single("image"),
    storeController.createStore
);

router.put(
    "/:storeId",
    roleMiddleware("owner"),
    upload.single("image"),
    storeController.updateStore
);

router.post(
    "/:storeId/image",
    roleMiddleware("owner"),
    upload.single("image"),
    storeController.uploadStoreImage
);

router.get(
    "/opening-cash-setting",
    storeMiddleware,
    storeController.getOpeningCashSetting
);

router.patch(
    "/opening-cash-setting",
    storeMiddleware,
    roleMiddleware("owner"),
    storeController.updateOpeningCashSetting
);

module.exports = router;
