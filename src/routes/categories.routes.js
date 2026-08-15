const express = require('express');
const { body } = require('express-validator');
const {
  listCategories, createCategory, updateCategory, deleteCategory,
} = require('../controllers/categories.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.get('/', listCategories);

router.post(
  '/',
  requireAuth,
  requireRole('superadmin', 'editor'),
  [body('name').isString().trim().isLength({ min: 2, max: 120 }).escape()],
  validate,
  createCategory
);

router.put(
  '/:id',
  requireAuth,
  requireRole('superadmin', 'editor'),
  [body('name').optional().isString().trim().isLength({ min: 2, max: 120 }).escape()],
  validate,
  updateCategory
);

router.delete('/:id', requireAuth, requireRole('superadmin'), deleteCategory);

module.exports = router;
