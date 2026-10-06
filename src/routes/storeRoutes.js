const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const storeController = require("../controllers/storeController");

router.use(authMiddleware);

router.get(
  "/",
  storeController.getMyStores
);

router.post(
  "/",
  roleMiddleware("owner"),
  storeController.createStore
);

module.exports = router;