const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const storeController = require("../controllers/storeController");

router.use(authMiddleware);

router.get(
  "/",
  storeController.getMyStores
);

module.exports = router;