const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { logAudit } = require('../utils/audit');
const { asyncHandler } = require('../utils/asyncHandler');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await pool.query('SELECT * FROM admins WHERE email = $1', [
    String(email || '').toLowerCase().trim(),
  ]);
  const admin = result.rows[0];

  const hashToCheck = admin ? admin.password_hash : '$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsa';
  const passwordMatches = await bcrypt.compare(password || '', hashToCheck);

  if (!admin || !passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  await logAudit({ adminId: admin.id, action: 'admin.login', ip: req.ip });

  res.json({ token, admin: { id: admin.id, email: admin.email, role: admin.role } });
});

const me = asyncHandler(async (req, res) => {
  res.json({ admin: req.admin });
});

module.exports = { login, me };
