const express = require("express");

const shiftController = require("../controllers/shiftController");

const authMiddleware = require("../middleware/authMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(storeMiddleware);

router.post(
  "/open",
  shiftController.openShift
);

router.get(
  "/current",
  shiftController.getCurrentShift
);

router.get(
  "/",
  shiftController.getShifts
);

router.post(
  "/:id/close",
  shiftController.closeShift
);

module.exports = router;