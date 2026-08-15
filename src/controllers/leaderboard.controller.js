const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/asyncHandler');

const getLeaderboard = asyncHandler(async (req, res) => {
  const { category = '', limit = 50 } = req.query;

  const conditions = ['n.is_active = true'];
  const params = [];
  if (category) {
    params.push(category);
    conditions.push(`c.slug = $${params.length}`);
  }
  params.push(Math.min(Number(limit) || 50, 200));

  const result = await pool.query(
    `SELECT n.id, n.name, n.photo_url, n.votes_count,
            c.name AS category_name, c.slug AS category_slug,
            RANK() OVER (ORDER BY n.votes_count DESC) AS rank
     FROM nominees n
     JOIN categories c ON c.id = n.category_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY n.votes_count DESC
     LIMIT $${params.length}`,
    params
  );

  const totalResult = await pool.query(
    `SELECT COALESCE(SUM(votes_count),0) AS total_votes FROM nominees WHERE is_active = true`
  );

  res.json({ leaderboard: result.rows, total_votes: Number(totalResult.rows[0].total_votes) });
});

module.exports = { getLeaderboard };
