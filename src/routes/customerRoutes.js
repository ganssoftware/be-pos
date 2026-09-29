const express = require("express");

const customerController = require("../controllers/customerController");

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner"));
router.use(storeMiddleware);

router.get(
  "/",
  customerController.getCustomers
);

router.get(
  "/:id",
  customerController.getCustomerById
);

router.post(
  "/",
  customerController.createCustomer
);

router.put(
  "/:id",
  customerController.updateCustomer
);

router.delete(
  "/:id",
  customerController.deleteCustomer
);

module.exports = router;