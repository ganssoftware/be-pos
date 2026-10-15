const express = require("express");

const reportController = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const {
  allowReportRoles,
} = require("../middleware/reportAccessMiddleware");

const router = express.Router();

const reportRoles = allowReportRoles("owner", "kasir");
const ownerOnly = allowReportRoles("owner");

router.use(authMiddleware);
router.use(reportRoles);
router.use(storeMiddleware);

router.get("/overview", reportController.getOverview);
router.get("/sales", reportController.getSales);
router.get("/payments", reportController.getPayments);
router.get("/products", reportController.getProducts);

router.get("/cashiers", reportController.getCashiers);
router.get("/shifts", reportController.getShifts);

router.get("/inventory", reportController.getInventory);

router.get(
  "/movements",
  ownerOnly,
  reportController.getMovements
);

router.get(
  "/profit-loss",
  ownerOnly,
  reportController.getProfitLoss
);

module.exports = router;
