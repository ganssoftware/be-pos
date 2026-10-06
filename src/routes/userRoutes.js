const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const userController = require("../controllers/userController");

router.use(authMiddleware);

router.post(
  "/owners",
  roleMiddleware("super-admin"),
  userController.createOwner
);

router.get(
  "/owners",
  roleMiddleware("super-admin"),
  userController.getOwners
);

router.get(
  "/",
  roleMiddleware("super-admin"),
  userController.getAllUsers
);

router.post(
  "/cashiers",
  roleMiddleware("owner"),
  userController.createCashier
);

router.get(
  "/cashiers",
  roleMiddleware("owner"),
  userController.getMyCashiers
);

router.patch(
  "/:userId/status",
  roleMiddleware("super-admin", "owner"),
  userController.updateUserStatus
);

module.exports = router;