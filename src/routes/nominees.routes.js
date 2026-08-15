const express = require('express');
const { body } = require('express-validator');
const {
  listNominees, getNominee, createNominee, updateNominee, deleteNominee,
} = require('../controllers/nominees.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.get('/', listNominees);
router.get('/:id', getNominee);

router.post(
  '/',
  requireAuth,
  requireRole('superadmin', 'editor'),
  [
    body('name').isString().trim().isLength({ min: 2, max: 160 }).escape(),
    body('category_id').isUUID(),
    body('state').optional().isString().trim().isLength({ max: 2 }).escape(),
    body('bio').optional().isString().trim().isLength({ max: 2000 }).escape(),
    body('photo_url').optional().isURL(),
  ],
  validate,
  createNominee
);

router.put(
  '/:id',
  requireAuth,
  requireRole('superadmin', 'editor'),
  [
    body('name').optional().isString().trim().isLength({ min: 2, max: 160 }).escape(),
    body('category_id').optional().isUUID(),
    body('photo_url').optional().isURL(),
  ],
  validate,
  updateNominee
);

router.delete('/:id', requireAuth, requireRole('superadmin', 'editor'), deleteNominee);

module.exports = router;
