const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserProfile,
  updateUserProfile,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');
const { protect, admin } = require('../middleware/authMiddleware');

// Self profile routes (All authenticated roles)
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

// Admin-only user management routes
router.route('/')
  .get(protect, admin, getUsers)
  .post(protect, admin, createUser);

router.route('/:id')
  .get(protect, admin, getUserById)
  .put(protect, admin, updateUser)
  .delete(protect, admin, deleteUser);

module.exports = router;
