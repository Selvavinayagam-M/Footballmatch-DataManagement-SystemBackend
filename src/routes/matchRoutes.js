const express = require('express');
const router = express.Router();
const {
  getMatches,
  getMatch,
  createMatch,
  updateMatch,
  deleteMatch,
  getMatchEvents,
  addMatchEvent,
  updateMatchEvent,
  deleteMatchEvent
} = require('../controllers/matchController');
const { protect, admin, authorize } = require('../middleware/authMiddleware');

router.route('/').get(protect, getMatches).post(protect, admin, createMatch);
router.route('/:id').get(protect, getMatch).put(protect, authorize('admin', 'qa', 'collector'), updateMatch).delete(protect, admin, deleteMatch);
router.route('/:id/events').get(protect, getMatchEvents).post(protect, authorize('admin', 'collector'), addMatchEvent);
router.route('/:id/events/:eventId')
  .put(protect, authorize('admin', 'collector', 'qa'), updateMatchEvent)
  .delete(protect, authorize('admin', 'collector', 'qa'), deleteMatchEvent);

module.exports = router;
