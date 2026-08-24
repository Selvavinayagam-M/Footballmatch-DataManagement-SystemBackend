const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

// GET /api/users - Search, Filter, Pagination
const getUsers = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};
    if (req.query.role) query.role = req.query.role;
    if (req.query.status) query.status = req.query.status;

    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      query.$or = [{ name: searchRegex }, { email: searchRegex }];
    }

    const count = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      users,
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/users/profile - Get current authenticated user profile
const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PUT /api/users/profile - Update own name / change password (FORBIDS role change)
const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Strict security rule: Do NOT allow changing own role
    if (req.body.role && req.body.role !== user.role) {
      return res.status(400).json({
        message: 'Action blocked: You cannot change your own role. Role changes require administrator approval.'
      });
    }

    const oldValues = {
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    if (req.body.name) {
      user.name = req.body.name.trim();
    }

    // Password Change Logic
    if (req.body.password && req.body.password.trim() !== '') {
      if (req.body.currentPassword) {
        const isMatch = await user.matchPassword(req.body.currentPassword);
        if (!isMatch) {
          return res.status(400).json({ message: 'Current password does not match.' });
        }
      }
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Updated',
      entityType: 'User',
      entityId: user._id,
      oldValue: oldValues,
      newValue: {
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status
      }
    });

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/users - Create User (Admin Only)
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, status } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this email address already exists.' });
    }

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: role || 'collector',
      status: status || 'active'
    });

    const createdUser = await user.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Created',
      entityType: 'User',
      entityId: createdUser._id,
      oldValue: null,
      newValue: {
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        status: createdUser.status
      }
    });

    res.status(201).json({
      _id: createdUser._id,
      name: createdUser.name,
      email: createdUser.email,
      role: createdUser.role,
      status: createdUser.status,
      createdAt: createdUser.createdAt
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/users/:id - Update User (Admin Only)
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const oldValues = {
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    const newRole = req.body.role || user.role;
    const newStatus = req.body.status || user.status;

    // Protection rule: Admin cannot accidentally remove / deactivate the final active administrator
    if (user.role === 'admin' && user.status === 'active') {
      const isDemoting = newRole !== 'admin';
      const isDeactivating = newStatus !== 'active';

      if (isDemoting || isDeactivating) {
        const otherActiveAdmins = await User.countDocuments({
          role: 'admin',
          status: 'active',
          _id: { $ne: user._id }
        });

        if (otherActiveAdmins === 0) {
          return res.status(400).json({
            message: 'Action blocked: Cannot deactivate or demote the final active administrator.'
          });
        }
      }
    }

    // Check duplicate email if changed
    if (req.body.email && req.body.email.trim().toLowerCase() !== user.email) {
      const duplicate = await User.findOne({ 
        email: req.body.email.trim().toLowerCase(), 
        _id: { $ne: user._id } 
      });
      if (duplicate) {
        return res.status(400).json({ message: 'A user with this email already exists.' });
      }
      user.email = req.body.email.trim().toLowerCase();
    }

    if (req.body.name) user.name = req.body.name.trim();
    if (req.body.role) user.role = req.body.role;
    if (req.body.status) user.status = req.body.status;
    if (req.body.password && req.body.password.trim() !== '') {
      user.password = req.body.password;
    }

    const updatedUser = await user.save();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Updated',
      entityType: 'User',
      entityId: user._id,
      oldValue: oldValues,
      newValue: {
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        status: updatedUser.status
      }
    });

    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      status: updatedUser.status,
      createdAt: updatedUser.createdAt
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/users/:id - Delete User (Admin Only)
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Protection rule: Cannot delete final active administrator
    if (user.role === 'admin') {
      const otherActiveAdmins = await User.countDocuments({
        role: 'admin',
        status: 'active',
        _id: { $ne: user._id }
      });

      if (otherActiveAdmins === 0) {
        return res.status(400).json({
          message: 'Action blocked: Cannot delete the final active administrator.'
        });
      }
    }

    const oldValues = {
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    };

    await user.deleteOne();

    // Create Audit Log
    await AuditLog.create({
      user: req.user._id,
      action: 'Deleted',
      entityType: 'User',
      entityId: user._id,
      oldValue: oldValues,
      newValue: null
    });

    res.json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserProfile,
  updateUserProfile,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
