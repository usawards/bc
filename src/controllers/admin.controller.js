const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');

const getStats = asyncHandler(async (req, res) => {
  const [votes, revenue, nominees, txStatus] = await Promise.all([
    pool.query(`SELECT COALESCE(SUM(votes_count),0) AS total_votes FROM nominees`),
    pool.query(`SELECT currency, COALESCE(SUM(amount),0) AS total FROM transactions WHERE status = 'success' GROUP BY currency`),
    pool.query(`SELECT COUNT(*) AS total_nominees FROM nominees WHERE is_active = true`),
    pool.query(`SELECT status, COUNT(*) AS count FROM transactions GROUP BY status`),
  ]);

  res.json({
    total_votes: Number(votes.rows[0].total_votes),
    revenue_by_currency: revenue.rows, // e.g. [{currency:'USD', total: '123.40'}, {currency:'KES', total: '5400.00'}]
    total_nominees: Number(nominees.rows[0].total_nominees),
    transactions_by_status: txStatus.rows,
  });
});

const listTransactions = asyncHandler(async (req, res) => {
  const { status = '', page = 1, limit = 50 } = req.query;
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const offset = (Math.max(Number(page), 1) - 1) * safeLimit;
  params.push(safeLimit, offset);

  const result = await pool.query(
    `SELECT t.id, t.reference, t.quantity, t.currency, t.amount, t.status, t.channel,
            t.voter_email, t.voter_phone, t.created_at, t.verified_at, n.name AS nominee_name
     FROM transactions t
     JOIN nominees n ON n.id = t.nominee_id
     ${where}
     ORDER BY t.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  res.json({ transactions: result.rows });
});

const exportTransactionsCsv = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT t.reference, n.name AS nominee_name, t.quantity, t.currency, t.amount, t.status,
            t.channel, t.voter_email, t.voter_phone, t.created_at
     FROM transactions t JOIN nominees n ON n.id = t.nominee_id
     ORDER BY t.created_at DESC`
  );

  const header = 'Reference,Nominee,Quantity,Currency,Amount,Status,Channel,Voter Email,Voter Phone,Created At\n';
  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const rows = result.rows
    .map((r) =>
      [r.reference, r.nominee_name, r.quantity, r.currency, r.amount, r.status, r.channel, r.voter_email, r.voter_phone, r.created_at]
        .map(escapeCsv)
        .join(',')
    )
    .join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="usea-transactions-${Date.now()}.csv"`);
  res.send(header + rows);
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const safeLimit = Math.min(Number(limit) || 50, 200);
  const offset = (Math.max(Number(page), 1) - 1) * safeLimit;

  const result = await pool.query(
    `SELECT a.id, a.action, a.details, a.ip_address, a.created_at, ad.email AS admin_email
     FROM audit_logs a LEFT JOIN admins ad ON ad.id = a.admin_id
     ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
    [safeLimit, offset]
  );

  res.json({ audit_logs: result.rows });
});

module.exports = { getStats, listTransactions, exportTransactionsCsv, listAuditLogs };
