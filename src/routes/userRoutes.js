const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const upload = require("../middleware/uploadImage");
const userController = require("../controllers/userController");

router.use(authMiddleware);

router.put(
  "/me",
  userController.updateMyProfile
);

router.post(
  "/me/photo",
  upload.single("image"),
  userController.uploadMyProfilePhoto
);

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

router.put(
  "/:userId",
  roleMiddleware("super-admin", "owner"),
  userController.updateManagedUser
);

router.patch(
  "/:userId/status",
  roleMiddleware("super-admin", "owner"),
  userController.updateUserStatus
);

router.get(
  "/",
  roleMiddleware("super-admin"),
  userController.getAllUsers
);

module.exports = router;