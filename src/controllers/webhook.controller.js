const crypto = require('crypto');
const { pool } = require('../config/db');
const { applySuccessfulTransaction } = require('./votes.controller');

async function handleWebhook(req, res) {
  const signature = req.headers['x-paystack-signature'];
  const expected = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body)
    .digest('hex');

  if (!signature || signature !== expected) {
    return res.status(401).send('Invalid signature.');
  }

  res.sendStatus(200);

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return;
  }

  // charge.success covers both the standard checkout flow and the M-Pesa
  // Charge API flow - Paystack emits the same event either way.
  if (event.event !== 'charge.success') return;

  const { reference } = event.data;
  try {
    const txResult = await pool.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
    const tx = txResult.rows[0];
    if (!tx) {
      console.warn(`Webhook for unknown reference: ${reference}`);
      return;
    }
    if (tx.status === 'success') return;

    await applySuccessfulTransaction(tx, event.data);
  } catch (err) {
    console.error('Failed to process Paystack webhook:', err);
  }
}

module.exports = { handleWebhook };
