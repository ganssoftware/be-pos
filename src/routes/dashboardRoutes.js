const express = require('express');
const router = express.Router();

const {
  getDashboard,
} = require('../controllers/dashboardController');

const authMiddleware = require('../middleware/authMiddleware');
const storeMiddleware = require('../middleware/storeMiddleware');

router.get(
  '/',
  authMiddleware,
  storeMiddleware,
  getDashboard
);

module.exports = router;