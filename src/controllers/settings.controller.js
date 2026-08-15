const { pool } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { asyncHandler } = require('../utils/asyncHandler');

// Public: homepage banner, prize list, voting deadline, etc.
const getSettings = asyncHandler(async (req, res) => {
  const result = await pool.query('SELECT key, value FROM settings');
  const settings = Object.fromEntries(result.rows.map((r) => [r.key, r.value]));
  res.json({ settings });
});

// Admin: update one setting key at a time, e.g. { "key": "homepage_banner", "value": {...} }
const updateSetting = asyncHandler(async (req, res) => {
  const { key, value } = req.body;
  if (!key) return res.status(400).json({ error: 'A setting "key" is required.' });

  const result = await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING *`,
    [key, value]
  );

  await logAudit({ adminId: req.admin.id, action: 'settings.update', details: { key }, ip: req.ip });
  res.json({ setting: result.rows[0] });
});

module.exports = { getSettings, updateSetting };
