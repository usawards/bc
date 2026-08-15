const { pool } = require('../config/db');

async function logAudit({ adminId = null, action, details = {}, ip = null }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (admin_id, action, details, ip_address) VALUES ($1, $2, $3, $4)`,
      [adminId, action, details, ip]
    );
  } catch (err) {
    // Audit logging should never break the main request flow.
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
