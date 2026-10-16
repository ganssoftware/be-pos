
const express = require("express");

const transactionController = require("../controllers/transactionController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(storeMiddleware);

// Riwayat transaksi toko.
router.get(
    "/",
    roleMiddleware("owner", "cashier"),
    transactionController.getTransactions
);

// Checkout boleh dilakukan owner dan cashier.
// Transaction service tetap mewajibkan shift OPEN milik user tersebut.
router.post(
    "/",
    roleMiddleware("owner", "cashier"),
    transactionController.checkout
);

// Void dan refund: otorisasi detail tetap divalidasi service.
router.post(
    "/:id/void",
    roleMiddleware("owner", "cashier"),
    transactionController.voidTransaction
);

router.post(
    "/:id/refund",
    roleMiddleware("owner", "cashier"),
    transactionController.refundTransaction
);

router.get(
    "/:id/receipt",
    roleMiddleware("owner", "cashier"),
    transactionController.getReceipt
);

router.get(
    "/:id",
    roleMiddleware("owner", "cashier"),
    transactionController.getTransactionById
);

module.exports = router;
