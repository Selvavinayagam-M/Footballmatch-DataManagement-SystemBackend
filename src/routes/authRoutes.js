const express = require('express');
const router = express.Router();
const { loginUser, getUserProfile, refreshToken, logoutUser } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.post('/refresh', refreshToken);
router.post('/logout', protect, logoutUser);
router.get('/profile', protect, getUserProfile);
router.get('/me', protect, getUserProfile);

module.exports = router;
