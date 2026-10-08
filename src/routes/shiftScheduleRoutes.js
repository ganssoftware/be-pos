const express = require("express");

const router = express.Router();

const controller = require("../controllers/shiftScheduleController");

// Sesuaikan middleware dengan route shift yang sekarang.
const authMiddleware = require("../middleware/authMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

router.use(authMiddleware);
router.use(storeMiddleware);

// GET semua jadwal shift
router.get("/", controller.getSchedules);

// GET detail jadwal
router.get("/:id", controller.getScheduleById);

// OWNER membuat jadwal
router.post("/", controller.createSchedule);

// OWNER mengubah jadwal
router.put("/:id", controller.updateSchedule);

// OWNER menghapus jadwal
router.delete("/:id", controller.deleteSchedule);

module.exports = router;
