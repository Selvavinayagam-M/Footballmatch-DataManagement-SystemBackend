const express = require('express');
const router = express.Router();
const { getTeams, getTeam, createTeam, updateTeam, deleteTeam } = require('../controllers/teamController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getTeams).post(protect, admin, createTeam);
router.route('/:id').get(protect, getTeam).put(protect, admin, updateTeam).delete(protect, admin, deleteTeam);

module.exports = router;
