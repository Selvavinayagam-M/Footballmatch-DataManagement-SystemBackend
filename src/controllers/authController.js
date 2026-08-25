const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
};

const generateRefreshToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const normalizedEmail = email ? email.trim().toLowerCase() : '';
    
    // Exact safe debug logs requested
    const user = await User.findOne({ email: normalizedEmail });
    const userFound = !!user;

    console.log(`[AUTH DEBUG] database: ${mongoose.connection.name}`);
    console.log(`[AUTH DEBUG] collection: ${User.collection.name}`);
    console.log(`[AUTH DEBUG] lookup email: ${normalizedEmail}`);
    console.log(`[AUTH DEBUG] user found: ${userFound}`);

    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'Invalid email or password'
      });
    }

    const userStatus = user.status ? user.status.toLowerCase() : 'inactive';
    const isUserActive = userStatus === 'active';

    if (!isUserActive) {
      return res.status(401).json({
        success: false,
        code: 'USER_INACTIVE',
        message: 'Account is inactive. Please contact an administrator.'
      });
    }

    const passwordMatch = await user.matchPassword(password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_PASSWORD',
        message: 'Invalid email or password'
      });
    }

    const jwtSecretAvailable = !!process.env.JWT_SECRET;
    if (!jwtSecretAvailable) {
      console.error('[LOGIN] JWT_SECRET is missing in environment variables');
      return res.status(500).json({
        success: false,
        code: 'JWT_CONFIGURATION_ERROR',
        message: 'Authentication configuration error'
      });
    }

    const normalizedRole = user.role ? user.role.toLowerCase() : 'collector';

    const token = generateToken(user._id, normalizedRole);
    const refreshToken = generateRefreshToken(user._id, normalizedRole);

    user.refreshToken = refreshToken;
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: normalizedRole
      }
    });
  } catch (error) {
    console.error('[LOGIN] ERROR:', error.message);
    res.status(500).json({
      success: false,
      code: 'SERVER_ERROR',
      message: error.message
    });
  }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ message: 'Invalid refresh token' });
    }

    const newToken = generateToken(user._id, user.role);
    res.json({ token: newToken });
  } catch (error) {
    res.status(403).json({ message: 'Refresh token expired or invalid' });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logoutUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      });
    } else {
      res.status(404).json({ message: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  loginUser,
  getUserProfile,
  refreshToken,
  logoutUser,
};
