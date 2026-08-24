const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getQualityReports,
  getCollectorPerformance,
  getAllEvents
} = require('../controllers/reportsController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.get('/dashboard', protect, getDashboardStats);
router.get('/reports/quality', protect, authorize('admin', 'qa', 'collector'), getQualityReports);
router.get('/quality-reports', protect, authorize('admin', 'qa', 'collector'), getQualityReports);

router.get('/reports/collector', protect, authorize('admin', 'collector'), getCollectorPerformance);
router.get('/collector-kpis', protect, authorize('admin', 'collector'), getCollectorPerformance);

router.get('/reports/all-events', protect, getAllEvents);

module.exports = router;
