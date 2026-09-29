const express = require("express");

const inventoryController =
  require("../controllers/inventoryController");

const authMiddleware =
  require("../middleware/authMiddleware");

const roleMiddleware =
  require("../middleware/roleMiddleware");

const storeMiddleware =
  require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner"));
router.use(storeMiddleware);

router.get(
  "/",
  inventoryController.getInventory
);

router.get(
  "/movements",
  inventoryController.getMovements
);

router.get(
  "/:productId",
  inventoryController.getInventoryByProduct
);

router.post(
  "/stock-in",
  inventoryController.stockIn
);

router.post(
  "/adjustment",
  inventoryController.adjustment
);

module.exports = router;