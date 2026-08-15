const { Pool } = require('pg');

// Render's managed Postgres requires SSL in production, but the CA isn't
// always in the default trust store, so we disable strict verification
// the same way Render's own docs recommend for their internal connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres error on idle client', err);
});

module.exports = { pool };
