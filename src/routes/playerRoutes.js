const express = require('express');
const router = express.Router();
const { getPlayers, getPlayer, createPlayer, updatePlayer, deletePlayer } = require('../controllers/playerController');
const { protect, admin, authorize } = require('../middleware/authMiddleware');

router.route('/').get(protect, getPlayers).post(protect, authorize('admin', 'collector'), createPlayer);
router.route('/:id').get(protect, getPlayer).put(protect, authorize('admin', 'collector', 'qa'), updatePlayer).delete(protect, admin, deletePlayer);

module.exports = router;
