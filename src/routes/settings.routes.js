const express = require('express');
const { body } = require('express-validator');
const { getSettings, updateSetting } = require('../controllers/settings.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.get('/', getSettings);

router.put(
  '/',
  requireAuth,
  requireRole('superadmin', 'editor'),
  [body('key').isString().notEmpty()],
  validate,
  updateSetting
);

module.exports = router;
