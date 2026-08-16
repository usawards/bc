const { pool } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { asyncHandler } = require('../utils/asyncHandler');

const listNominees = asyncHandler(async (req, res) => {
  const { search = '', category = '', state = '', sort = 'votes', page = 1, limit = 24 } = req.query;

  const conditions = ['n.is_active = true'];
  const params = [];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`n.name ILIKE $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${params.length}`);
  }
  if (state) {
    params.push(state);
    conditions.push(`n.state = $${params.length}`);
  }

  const orderBy = sort === 'newest' ? 'n.created_at DESC' : 'n.votes_count DESC';
  const safeLimit = Math.min(Number(limit) || 24, 100);
  const offset = (Math.max(Number(page), 1) - 1) * safeLimit;
  params.push(safeLimit, offset);

  const query = `
    SELECT n.id, n.name, n.state, n.bio, n.photo_url, n.social_links, n.votes_count, n.created_at,
           c.name AS category_name, c.slug AS category_slug, c.payment_mode AS category_payment_mode
    FROM nominees n
    JOIN categories c ON c.id = n.category_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;

  const result = await pool.query(query, params);
  res.json({ nominees: result.rows });
});

const getNominee = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT n.*, c.name AS category_name, c.slug AS category_slug, c.payment_mode AS category_payment_mode
     FROM nominees n JOIN categories c ON c.id = n.category_id
     WHERE n.id = $1 AND n.is_active = true`,
    [req.params.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Nominee not found.' });
  res.json({ nominee: result.rows[0] });
});

const createNominee = asyncHandler(async (req, res) => {
  const { name, category_id, state, bio, photo_url, social_links } = req.body;

  const result = await pool.query(
    `INSERT INTO nominees (name, category_id, state, bio, photo_url, social_links)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [name, category_id, state || null, bio || null, photo_url || null, social_links || {}]
  );

  await logAudit({ adminId: req.admin.id, action: 'nominee.create', details: { id: result.rows[0].id }, ip: req.ip });
  res.status(201).json({ nominee: result.rows[0] });
});

const updateNominee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, category_id, state, bio, photo_url, social_links, is_active } = req.body;

  const result = await pool.query(
    `UPDATE nominees SET
       name = COALESCE($1, name),
       category_id = COALESCE($2, category_id),
       state = COALESCE($3, state),
       bio = COALESCE($4, bio),
       photo_url = COALESCE($5, photo_url),
       social_links = COALESCE($6, social_links),
       is_active = COALESCE($7, is_active),
       updated_at = now()
     WHERE id = $8 RETURNING *`,
    [name, category_id, state, bio, photo_url, social_links, is_active, id]
  );

  if (!result.rows[0]) return res.status(404).json({ error: 'Nominee not found.' });

  await logAudit({ adminId: req.admin.id, action: 'nominee.update', details: { id }, ip: req.ip });
  res.json({ nominee: result.rows[0] });
});

const deleteNominee = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await pool.query(
    `UPDATE nominees SET is_active = false, updated_at = now() WHERE id = $1 RETURNING id`,
    [id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Nominee not found.' });

  await logAudit({ adminId: req.admin.id, action: 'nominee.delete', details: { id }, ip: req.ip });
  res.status(204).send();
});

module.exports = { listNominees, getNominee, createNominee, updateNominee, deleteNominee };
