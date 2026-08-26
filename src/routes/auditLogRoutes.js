const express = require('express');
const router = express.Router();
const { getAuditLogs, getAuditLogById } = require('../controllers/auditLogController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All audit log endpoints are strictly Admin and QA (Immutable Read-Only)
router.route('/')
  .get(protect, authorize('admin', 'qa'), getAuditLogs);

router.route('/:id')
  .get(protect, authorize('admin', 'qa'), getAuditLogById);

module.exports = router;
