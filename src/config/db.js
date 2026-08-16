const { Pool } = require('pg');

// Works against any standard Postgres connection string, including
// Supabase's pooled connection (Supavisor, port 6543) - recommended over
// the direct connection since this backend keeps a persistent pg.Pool open,
// and Supabase's free tier caps direct connections low.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error on idle client', err);
});

module.exports = { pool };
