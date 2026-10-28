
const express = require("express");

const controller = require("../controllers/passwordResetController");

const router = express.Router();

router.post("/request", controller.requestReset);
router.post("/confirm", controller.confirmReset);

module.exports = router;
