const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  getStats, listTransactions, exportTransactionsCsv, listAuditLogs,
} = require('../controllers/admin.controller');

const router = express.Router();

router.use(requireAuth, requireRole('superadmin', 'editor'));

router.get('/stats', getStats);
router.get('/transactions', listTransactions);
router.get('/transactions/export.csv', exportTransactionsCsv);
router.get('/audit-logs', requireRole('superadmin'), listAuditLogs);

module.exports = router;
