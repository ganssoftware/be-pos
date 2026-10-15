
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
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

// Endpoint khusus untuk mengganti foto toko saja.
router.post(
    "/:storeId/image",
    roleMiddleware("owner"),
    upload.single("image"),
    storeController.uploadStoreImage
);

module.exports = router;
