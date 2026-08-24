const express = require('express');
const router = express.Router();
const {
  getCompetitions,
  getCompetition,
  createCompetition,
  updateCompetition,
  deleteCompetition,
} = require('../controllers/competitionController');
const { protect, admin } = require('../middleware/authMiddleware');

router.route('/').get(protect, getCompetitions).post(protect, admin, createCompetition);
router.route('/:id').get(protect, getCompetition).put(protect, admin, updateCompetition).delete(protect, admin, deleteCompetition);

module.exports = router;
