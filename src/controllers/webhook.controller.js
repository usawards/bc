const crypto = require('crypto');
const { pool } = require('../config/db');
const { applySuccessfulTransaction } = require('./votes.controller');

// Paystack webhook. Mounted on a route that uses express.raw() (see
// server.js) because the HMAC signature must be computed over the exact
// raw request body - a parsed/re-serialized JSON object will not match.
async function handleWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body) // raw Buffer
    .digest('hex');

  if (!signature || signature !== expected) {
    return res.status(401).send('Invalid signature.');
  }

  // Acknowledge immediately - Paystack retries if it doesn't get a fast 200.
  res.sendStatus(200);

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return; // malformed body, nothing to do
  }

  if (event.event !== 'charge.success') return;

  const { reference } = event.data;
  try {
    const txResult = await pool.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
    const tx = txResult.rows[0];
    if (!tx) {
      console.warn(`Webhook for unknown reference: ${reference}`);
      return;
    }
    if (tx.status === 'success') return; // duplicate delivery protection

    await applySuccessfulTransaction(tx, event.data);
  } catch (err) {
    console.error('Failed to process Paystack webhook:', err);
  }
}

module.exports = { handleWebhook };
