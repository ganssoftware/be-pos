const express = require("express");
const router = express.Router();

const masterProductController = require("../controllers/masterProductController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get(
  "/barcode/:barcode",
  masterProductController.getByBarcode
);

router.post(
  "/submit",
  authMiddleware,
  roleMiddleware("owner"),
  masterProductController.submit
);

router.get(
  "/",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.getAll
);

router.get(
  "/pending",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.getPending
);

router.post(
  "/",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.create
);

router.patch(
  "/:id/approve",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.approve
);

router.patch(
  "/:id/reject",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.reject
);

router.patch(
  "/:id/status",
  authMiddleware,
  roleMiddleware("super-admin"),
  masterProductController.updateStatus
);

module.exports = router;
