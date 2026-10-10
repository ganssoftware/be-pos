
const express = require("express");

const router = express.Router();

const controller = require("../controllers/shiftScheduleController");
const authMiddleware = require("../middleware/authMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.use(authMiddleware);
router.use(storeMiddleware);

// Owner dapat mengelola jadwal.
router.get(
  "/",
  controller.getSchedules
);

router.get(
  "/:id",
  controller.getScheduleById
);

router.post(
  "/",
  roleMiddleware("owner"),
  controller.createSchedule
);

router.put(
  "/:id",
  roleMiddleware("owner"),
  controller.updateSchedule
);

router.delete(
  "/:id",
  roleMiddleware("owner"),
  controller.deleteSchedule
);

module.exports = router;
