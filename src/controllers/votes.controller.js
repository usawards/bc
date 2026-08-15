const crypto = require('crypto');
const { pool } = require('../config/db');
const { paystack } = require('../config/paystack');
const { asyncHandler } = require('../utils/asyncHandler');

const VOTE_PRICE_USD = Number(process.env.VOTE_PRICE_USD || 0.9);

// Step 1: user picks a nominee + quantity on the frontend and calls this.
// We create a "pending" transaction row, then ask Paystack to open a
// checkout (which offers Apple Pay + card automatically based on your
// Paystack dashboard channel settings and the visitor's device/browser).
const initiateVote = asyncHandler(async (req, res) => {
  const { nominee_id, quantity, email, name } = req.body;

  const nomineeResult = await pool.query(
    'SELECT id, name, is_active FROM nominees WHERE id = $1',
    [nominee_id]
  );
  const nominee = nomineeResult.rows[0];
  if (!nominee || !nominee.is_active) {
    return res.status(404).json({ error: 'Nominee not found.' });
  }

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 5000) {
    return res.status(400).json({ error: 'Quantity must be a whole number between 1 and 5000.' });
  }

  const amountUsd = Number((qty * VOTE_PRICE_USD).toFixed(2));
  const amountKobo = Math.round(amountUsd * 100); // Paystack expects the smallest currency unit
  const reference = `USEA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

  await pool.query(
    `INSERT INTO transactions (reference, nominee_id, quantity, amount_usd, amount_kobo, voter_email, voter_name, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [reference, nominee.id, qty, amountUsd, amountKobo, email, name || null, req.ip]
  );

  try {
    const paystackResponse = await paystack.post('/transaction/initialize', {
      email,
      amount: amountKobo,
      reference,
      currency: 'USD',
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      channels: ['card', 'apple_pay'],
      metadata: {
        nominee_id: nominee.id,
        nominee_name: nominee.name,
        quantity: qty,
        custom_fields: [
          { display_name: 'Nominee', variable_name: 'nominee', value: nominee.name },
          { display_name: 'Votes', variable_name: 'votes', value: qty },
        ],
      },
    });

    const { authorization_url, access_code } = paystackResponse.data.data;
    res.status(201).json({ reference, amount_usd: amountUsd, authorization_url, access_code });
  } catch (err) {
    await pool.query(`UPDATE transactions SET status = 'failed' WHERE reference = $1`, [reference]);
    const message = err.response?.data?.message || 'Could not start payment with Paystack.';
    res.status(502).json({ error: message });
  }
});

// Fallback for the frontend to poll after Paystack redirects the browser
// back, in case the webhook hasn't landed yet.
const verifyVote = asyncHandler(async (req, res) => {
  const { reference } = req.params;

  const txResult = await pool.query('SELECT * FROM transactions WHERE reference = $1', [reference]);
  const tx = txResult.rows[0];
  if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

  if (tx.status === 'success') {
    return res.json({ status: 'success', reference, quantity: tx.quantity });
  }

  const verifyResponse = await paystack.get(`/transaction/verify/${reference}`);
  const data = verifyResponse.data.data;

  if (data.status === 'success' && tx.status !== 'success') {
    await applySuccessfulTransaction(tx, data);
    return res.json({ status: 'success', reference, quantity: tx.quantity });
  }

  if (data.status === 'failed') {
    await pool.query(`UPDATE transactions SET status = 'failed', paystack_data = $1 WHERE reference = $2`, [data, reference]);
  }

  res.json({ status: data.status, reference });
});

// Shared by both the webhook and the manual-verify fallback so votes are
// only ever credited once no matter which path confirms payment first.
async function applySuccessfulTransaction(tx, paystackData) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-check status inside the transaction to prevent a double-credit race
    // if the webhook and the verify endpoint land at the same moment.
    const lockResult = await client.query(
      `SELECT status FROM transactions WHERE id = $1 FOR UPDATE`,
      [tx.id]
    );
    if (lockResult.rows[0].status === 'success') {
      await client.query('ROLLBACK');
      return;
    }

    await client.query(
      `UPDATE transactions SET status = 'success', channel = $1, paystack_data = $2, verified_at = now() WHERE id = $3`,
      [paystackData.channel || null, paystackData, tx.id]
    );
    await client.query(
      `UPDATE nominees SET votes_count = votes_count + $1, updated_at = now() WHERE id = $2`,
      [tx.quantity, tx.nominee_id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { initiateVote, verifyVote, applySuccessfulTransaction };
