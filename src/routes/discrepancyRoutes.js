const express = require('express');
const router = express.Router();
const {
  getDiscrepancies,
  getDiscrepancy,
  createDiscrepancy,
  updateDiscrepancy,
  resolveDiscrepancy,
  deleteDiscrepancy,
  scanMatchDataQuality
} = require('../controllers/discrepancyController');
const { protect, qaOrAdmin, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getDiscrepancies)
  .post(protect, createDiscrepancy);

router.route('/scan/:matchId')
  .post(protect, authorize('admin', 'qa'), scanMatchDataQuality);

router.route('/:id')
  .get(protect, getDiscrepancy)
  .put(protect, qaOrAdmin, updateDiscrepancy)
  .delete(protect, qaOrAdmin, deleteDiscrepancy);

router.route('/:id/resolve')
  .patch(protect, qaOrAdmin, resolveDiscrepancy)
  .put(protect, qaOrAdmin, resolveDiscrepancy);

module.exports = router;
