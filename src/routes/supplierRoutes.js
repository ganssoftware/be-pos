const express = require("express");

const supplierController =
  require("../controllers/supplierController");

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
  supplierController.getSuppliers
);

router.get(
  "/:id",
  supplierController.getSupplierById
);

router.post(
  "/",
  supplierController.createSupplier
);

router.put(
  "/:id",
  supplierController.updateSupplier
);

router.delete(
  "/:id",
  supplierController.deleteSupplier
);

module.exports = router;