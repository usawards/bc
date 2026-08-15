// Usage: node scripts/createAdmin.js admin@example.com "StrongPassword123" superadmin
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function createAdmin() {
  const [, , email, password, role = 'editor'] = process.argv;
  if (!email || !password) {
    console.error('Usage: node scripts/createAdmin.js <email> <password> [role]');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('Password must be at least 10 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const client = await pool.connect();
  try {
    const result = await client.query(
      `INSERT INTO admins (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
       RETURNING id, email, role`,
      [email.toLowerCase().trim(), hash, role]
    );
    console.log('Admin created/updated:', result.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

createAdmin().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
