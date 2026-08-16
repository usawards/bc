const { pool } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { asyncHandler } = require('../utils/asyncHandler');

const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const listCategories = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT * FROM categories ORDER BY created_at ASC');
  res.json({ categories: result.rows });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name, description, payment_mode } = req.body;
  const slug = slugify(name);

  const result = await pool.query(
    `INSERT INTO categories (name, slug, description, payment_mode) VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, slug, description || null, payment_mode || 'standard']
  );

  await logAudit({ adminId: req.admin.id, action: 'category.create', details: { id: result.rows[0].id }, ip: req.ip });
  res.status(201).json({ category: result.rows[0] });
});

const updateCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, description, payment_mode } = req.body;

  const result = await pool.query(
    `UPDATE categories SET
       name = COALESCE($1, name),
       description = COALESCE($2, description),
       payment_mode = COALESCE($3, payment_mode)
     WHERE id = $4 RETURNING *`,
    [name || null, description ?? null, payment_mode || null, id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found.' });

  await logAudit({ adminId: req.admin.id, action: 'category.update', details: { id }, ip: req.ip });
  res.json({ category: result.rows[0] });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const nomineeCheck = await pool.query('SELECT COUNT(*) FROM nominees WHERE category_id = $1', [id]);

  if (Number(nomineeCheck.rows[0].count) > 0) {
    return res.status(409).json({ error: 'Cannot delete a category that still has nominees.' });
  }

  const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found.' });

  await logAudit({ adminId: req.admin.id, action: 'category.delete', details: { id }, ip: req.ip });
  res.status(204).send();
});

module.exports = { listCategories, createCategory, updateCategory, deleteCategory };
