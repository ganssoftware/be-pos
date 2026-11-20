const express = require("express");
const customerController = require("../controllers/customerController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");
const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner", "cashier"));
router.use(storeMiddleware);

router.get("/search", customerController.searchCustomer);
router.get("/", customerController.getCustomers);
router.get("/loyalty/settings", customerController.getLoyaltySettings);
router.put("/loyalty/settings", roleMiddleware("owner"), customerController.updateLoyaltySettings);
router.get("/:id/points", customerController.getPoints);
router.get("/:id", customerController.getCustomerById);
router.post("/", customerController.createCustomer);
router.put("/:id", roleMiddleware("owner"), customerController.updateCustomer);
router.patch("/:id/status", roleMiddleware("owner"), customerController.setCustomerStatus);
router.delete("/:id", roleMiddleware("owner"), customerController.deleteCustomer);
module.exports = router;
