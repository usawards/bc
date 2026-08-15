const express = require('express');
const { handleWebhook } = require('../controllers/webhook.controller');

const router = express.Router();

// NOTE: express.raw() is applied here (not globally) so this route sees
// the untouched request body, which is required for signature verification.
router.post('/paystack', express.raw({ type: 'application/json' }), handleWebhook);

module.exports = router;
