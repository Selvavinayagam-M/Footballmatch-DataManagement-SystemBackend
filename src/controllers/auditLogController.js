const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

// GET /api/audit-logs - Comprehensive Search, Filters, Date presets, Pagination
const getAuditLogs = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const query = {};

    // Filter by Action
    if (req.query.action) {
      query.action = req.query.action;
    }

    // Filter by Entity Type
    if (req.query.entityType) {
      query.entityType = req.query.entityType;
    }

    // Filter by User
    if (req.query.user) {
      if (mongoose.Types.ObjectId.isValid(req.query.user)) {
        query.user = req.query.user;
      }
    }

    // Date Range Filtering
    const { preset, startDate, endDate } = req.query;
    let start = null;
    let end = new Date();
    end.setHours(23, 59, 59, 999);

    const now = new Date();
    if (preset === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    } else if (preset === 'yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
    } else if (preset === '7days') {
      start = new Date();
      start.setDate(now.getDate() - 7);
      start.setHours(0, 0, 0, 0);
    } else if (preset === '30days') {
      start = new Date();
      start.setDate(now.getDate() - 30);
      start.setHours(0, 0, 0, 0);
    } else if (preset === 'custom' && startDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (endDate) {
        end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
      }
    }

    if (start) {
      query.timestamp = { $gte: start, $lte: end };
    }

    // Search query (entityId string or entityType)
    if (req.query.search) {
      const s = req.query.search.trim();
      if (mongoose.Types.ObjectId.isValid(s)) {
        query.entityId = s;
      } else {
        query.entityType = { $regex: s, $options: 'i' };
      }
    }

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('user', 'name email role')
      .sort({ timestamp: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      logs,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/audit-logs/:id - Single audit log details
const getAuditLogById = async (req, res) => {
  try {
    const log = await AuditLog.findById(req.params.id).populate('user', 'name email role');
    if (!log) return res.status(404).json({ message: 'Audit log record not found.' });
    res.json(log);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getAuditLogs, getAuditLogById };
