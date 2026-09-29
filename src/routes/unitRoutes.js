const express = require("express");

const unitController = require("../controllers/unitController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const storeMiddleware = require("../middleware/storeMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.use(roleMiddleware("owner"));
router.use(storeMiddleware);

router.get("/", unitController.getUnits);

router.get("/:id", unitController.getUnitById);

router.post("/", unitController.createUnit);

router.put("/:id", unitController.updateUnit);

router.delete("/:id", unitController.deleteUnit);

module.exports = router;