const express = require('express');
const router = express.Router();
const {
  getVerificationMatches,
  getMatchReviewPackage,
  handleQAAction,
  submitForQA
} = require('../controllers/verificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/matches')
  .get(protect, getVerificationMatches);

router.route('/match/:id/full-package')
  .get(protect, getMatchReviewPackage);

router.route('/match/:id/action')
  .post(protect, authorize('admin', 'qa'), handleQAAction);

router.route('/match/:id/submit')
  .post(protect, authorize('admin', 'collector'), submitForQA);

module.exports = router;
