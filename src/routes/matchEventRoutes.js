const express = require('express');
const router = express.Router();
const {
  getAllMatchEvents,
  getMatchEventById,
  createMatchEvent,
  updateMatchEvent,
  verifyMatchEvent,
  deleteMatchEvent
} = require('../controllers/matchEventController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.route('/')
  .get(protect, getAllMatchEvents)
  .post(protect, authorize('admin', 'collector'), createMatchEvent);

router.route('/:id')
  .get(protect, getMatchEventById)
  .put(protect, authorize('admin', 'collector', 'qa'), updateMatchEvent)
  .delete(protect, authorize('admin', 'collector', 'qa'), deleteMatchEvent);

router.route('/:id/verify')
  .put(protect, authorize('admin', 'qa'), verifyMatchEvent);

module.exports = router;
