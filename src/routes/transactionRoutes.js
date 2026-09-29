const express = require("express");

const transactionController = require("../controllers/transactionController");

const authMiddleware = require("../middleware/authMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(storeMiddleware);

router.get("/", transactionController.getTransactions);

router.post("/:id/void", transactionController.voidTransaction);

router.post("/:id/refund", transactionController.refundTransaction);

router.get("/:id/receipt", transactionController.getReceipt);

router.get("/:id", transactionController.getTransactionById);

router.post("/", transactionController.checkout);

module.exports = router;