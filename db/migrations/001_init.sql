CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('superadmin','editor')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  -- 'standard' = USD via card/Apple Pay. 'mpesa' = KES via M-Pesa STK push.
  -- Only the "Best African Youth Leader" category should be 'mpesa'.
  payment_mode TEXT NOT NULL DEFAULT 'standard' CHECK (payment_mode IN ('standard','mpesa')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nominees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  state TEXT,
  bio TEXT,
  photo_url TEXT,
  social_links JSONB DEFAULT '{}'::jsonb,
  votes_count BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nominees_category ON nominees(category_id);
CREATE INDEX IF NOT EXISTS idx_nominees_state ON nominees(state);
CREATE INDEX IF NOT EXISTS idx_nominees_votes ON nominees(votes_count DESC);

-- One row per vote purchase attempt (pending -> success/failed)
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL,
  nominee_id UUID NOT NULL REFERENCES nominees(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','KES')),
  amount NUMERIC(12,2) NOT NULL,       -- amount in the transaction's currency, major unit
  amount_subunit BIGINT NOT NULL,      -- amount sent to Paystack (cents / KES minor unit)
  -- Voter email is SYSTEM-GENERATED (not entered by the voter) - see
  -- votes.controller.js. Kept because Paystack requires an email to
  -- process any charge, but it's synthetic, not a contact address.
  voter_email TEXT NOT NULL,
  voter_name TEXT,
  voter_phone TEXT, -- only populated for mpesa (M-Pesa STK push) transactions
  channel TEXT,     -- card, apple_pay, mobile_money, etc (from Paystack)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  paystack_data JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_tx_nominee ON transactions(nominee_id);
CREATE INDEX IF NOT EXISTS idx_tx_reference ON transactions(reference);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('voting_deadline', '"2026-09-01T00:00:00.000Z"'),
  ('homepage_banner', '{"headline":"2026 Voting Now Open","subtext":"Recognizing American Excellence"}'),
  ('prizes', '["Gold Medallion","National Feature","Verified Badge","Awards Gala Invite"]')
ON CONFLICT (key) DO NOTHING;
