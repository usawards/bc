const crypto = require('crypto');
const { pool } = require('../config/db');
const { paystack } = require('../config/paystack');
const { asyncHandler } = require('../utils/asyncHandler');

const VOTE_PRICE_USD = Number(process.env.VOTE_PRICE_USD || 0.9);
const VOTE_PRICE_KES = Number(process.env.VOTE_PRICE_KES || 120); // placeholder - set your real KES price

// Voters never type an email - Paystack requires one to process any charge,
// so we generate a throwaway, clearly-fake one per transaction. ".invalid"
// is a TLD reserved by RFC 2606 specifically so addresses like this can
// never resolve to a real inbox or misroute to someone else's.
function generateSyntheticEmail() {
  return `voter-${crypto.randomBytes(6).toString('hex')}@usea-voter.invalid`;
}

// Step 1: create a pending transaction, then either start a standard
// card/Apple Pay checkout (USD) or trigger an M-Pesa STK push (KES) -
// which flow runs depends on the nominee's category.payment_mode.
const initiateVote = asyncHandler(async (req, res) => {
  const { nominee_id, quantity, name, preferred_channel, voter_phone } = req.body;

  const nomineeResult = await pool.query(
    `SELECT n.id, n.name, n.is_active, c.payment_mode
     FROM nominees n JOIN categories c ON c.id = n.category_id
     WHERE n.id = $1`,
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

  const email = generateSyntheticEmail();
  const reference = `USEA-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

  if (nominee.payment_mode === 'mpesa') {
    return initiateMpesaVote({ req, res, nominee, qty, email, name, voter_phone, reference });
  }
  return initiateStandardVote({ req, res, nominee, qty, email, name, preferred_channel, reference });
});

// ---- Standard flow: USD via card / Apple Pay, hosted Paystack checkout ----
async function initiateStandardVote({ req, res, nominee, qty, email, name, preferred_channel, reference }) {
  const amount = Number((qty * VOTE_PRICE_USD).toFixed(2));
  const amountSubunit = Math.round(amount * 100);

  await pool.query(
    `INSERT INTO transactions (reference, nominee_id, quantity, currency, amount, amount_subunit, voter_email, voter_name, ip_address)
     VALUES ($1, $2, $3, 'USD', $4, $5, $6, $7, $8)`,
    [reference, nominee.id, qty, amount, amountSubunit, email, name || null, req.ip]
  );

  // preferred_channel lets the frontend put "Pay with Apple Pay" as the
  // primary button and "Pay with card" as a secondary one - both still
  // redirect to Paystack's own secure hosted checkout either way; this
  // only narrows which channel(s) that page opens with.
  const channels = ['apple_pay', 'card'].includes(preferred_channel)
    ? [preferred_channel]
    : ['apple_pay', 'card'];

  try {
    const paystackResponse = await paystack.post('/transaction/initialize', {
      email,
      amount: amountSubunit,
      reference,
      currency: 'USD',
      callback_url: process.env.PAYSTACK_CALLBACK_URL,
      channels,
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
    res.status(201).json({ reference, amount_usd: amount, authorization_url, access_code, flow: 'redirect' });
  } catch (err) {
    await pool.query(`UPDATE transactions SET status = 'failed' WHERE reference = $1`, [reference]);
    const message = err.response?.data?.message || 'Could not start payment with Paystack.';
    res.status(502).json({ error: message });
  }
}

// ---- M-Pesa flow: KES via Paystack's Charge API, triggers an STK push ----
// direct to the voter's phone - no redirect, no hosted page. The frontend
// polls /api/votes/verify/:reference the same way as the standard flow.
async function initiateMpesaVote({ req, res, nominee, qty, email, name, voter_phone, reference }) {
  const phone = String(voter_phone || '').replace(/\s+/g, '');
  if (!/^(?:\+?254|0)7\d{8}$/.test(phone)) {
    return res.status(400).json({ error: 'Enter a valid Kenyan M-Pesa number, e.g. 07XXXXXXXX or 2547XXXXXXXX.' });
  }
  const normalizedPhone = phone.replace(/^0/, '254').replace(/^\+/, '');

  const amount = Number((qty * VOTE_PRICE_KES).toFixed(2));
  const amountSubunit = Math.round(amount * 100);

  await pool.query(
    `INSERT INTO transactions (reference, nominee_id, quantity, currency, amount, amount_subunit, voter_email, voter_name, voter_phone, ip_address)
     VALUES ($1, $2, $3, 'KES', $4, $5, $6, $7, $8, $9)`,
    [reference, nominee.id, qty, amount, amountSubunit, email, name || null, normalizedPhone, req.ip]
  );

  try {
    const chargeResponse = await paystack.post('/charge', {
      email,
      amount: amountSubunit,
      currency: 'KES',
      reference,
      mobile_money: { phone: normalizedPhone, provider: 'mpesa' },
    });

    const data = chargeResponse.data.data;
    res.status(201).json({
      reference,
      amount_kes: amount,
      flow: 'stk_push',
      status: data.status, // e.g. "pay_offline" while the STK prompt is pending on-device
      display_text: data.display_text || 'Check your phone and enter your M-Pesa PIN to complete this vote.',
    });
  } catch (err) {
    await pool.query(`UPDATE transactions SET status = 'failed' WHERE reference = $1`, [reference]);
    const message = err.response?.data?.message || 'Could not start the M-Pesa payment with Paystack.';
    res.status(502).json({ error: message });
  }
}

// Fallback for the frontend to poll after either flow, until the payment
// resolves (Paystack's own webhook is still the primary confirmation path).
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

    const lockResult = await client.query(`SELECT status FROM transactions WHERE id = $1 FOR UPDATE`, [tx.id]);
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
