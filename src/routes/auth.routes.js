const express = require('express');
const { body } = require('express-validator');
const { login, me } = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { sensitiveLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post(
  '/login',
  sensitiveLimiter,
  [body('email').isEmail().normalizeEmail(), body('password').isString().notEmpty()],
  validate,
  login
);

router.get('/me', requireAuth, me);

module.exports = router;
