const express = require('express');
const router = express.Router();
const { 
  getSquads, 
  getSquadById, 
  createSquad, 
  updateSquad, 
  deleteSquad, 
  runSquadCheck,
  requestCorrection,
  verifySquad
} = require('../controllers/squadController');
const { protect, admin, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getSquads)
  .post(protect, authorize('admin', 'collector'), createSquad);

router.route('/:id')
  .get(protect, getSquadById)
  .put(protect, authorize('admin', 'collector'), updateSquad)
  .delete(protect, admin, deleteSquad);

router.route('/:id/check')
  .post(protect, authorize('admin', 'qa', 'collector'), runSquadCheck);

router.route('/:id/verify')
  .post(protect, authorize('admin', 'qa'), verifySquad);

router.route('/:id/request-correction')
  .post(protect, authorize('admin', 'qa'), requestCorrection);

module.exports = router;
