const express = require('express');
const { body } = require('express-validator');
const { initiateVote, verifyVote } = require('../controllers/votes.controller');
const { validate } = require('../middleware/validate');
const { sensitiveLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/initiate',
  sensitiveLimiter,
  [
    body('nominee_id').isUUID(),
    body('quantity').isInt({ min: 1, max: 5000 }),
    body('name').optional().isString().trim().isLength({ max: 120 }).escape(),
    // Only relevant for the standard USD flow - which channel to open the
    // Paystack checkout with first (see votes.controller.js).
    body('preferred_channel').optional().isIn(['apple_pay', 'card']),
    // Only required for nominees whose category is M-Pesa-enabled - the
    // controller itself enforces that requirement, since it needs to look
    // up the category first to know which flow applies.
    body('voter_phone').optional().isString().trim().isLength({ max: 20 }),
  ],
  validate,
  initiateVote
);

router.get('/verify/:reference', verifyVote);

module.exports = router;
