
const express = require('express');
const router = express.Router();

const {
  getSuperAdminDashboard,
} = require('../controllers/superAdminDashboardController');

const authMiddleware = require('../middleware/authMiddleware');
const roleMiddleware = require('../middleware/roleMiddleware');

router.get(
  '/dashboard',
  authMiddleware,
  roleMiddleware('super-admin'),
  getSuperAdminDashboard
);

module.exports = router;
