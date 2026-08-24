const express = require('express');
const router = express.Router();
const { getAuditLogs, getAuditLogById } = require('../controllers/auditLogController');
const { protect, admin } = require('../middleware/authMiddleware');

// All audit log endpoints are strictly Admin-only and Read-Only (Immutable)
router.route('/')
  .get(protect, admin, getAuditLogs);

router.route('/:id')
  .get(protect, admin, getAuditLogById);

module.exports = router;
