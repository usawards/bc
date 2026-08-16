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
    body('email').isEmail().normalizeEmail(),
    body('name').optional().isString().trim().isLength({ max: 120 }).escape(),
  ],
  validate,
  initiateVote
);

router.get('/verify/:reference', verifyVote);

module.exports = router;
