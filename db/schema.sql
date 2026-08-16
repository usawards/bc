-- USEA schema for Supabase.
-- Run this once in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- (supabase-js can't execute DDL like CREATE TABLE - this step has to
-- happen through the SQL Editor, or psql/any Postgres client pointed at
-- your project, not through the running app.)

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null default 'editor' check (role in ('superadmin','editor')),
  created_at timestamptz not null default now()
);

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists nominees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid not null references categories(id) on delete restrict,
  state text,
  bio text,
  photo_url text,
  social_links jsonb default '{}'::jsonb,
  votes_count bigint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_nominees_category on nominees(category_id);
create index if not exists idx_nominees_state on nominees(state);
create index if not exists idx_nominees_votes on nominees(votes_count desc);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  nominee_id uuid not null references nominees(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  amount_usd numeric(10,2) not null,
  amount_kobo bigint not null,
  voter_email text not null,
  voter_name text,
  channel text,
  status text not null default 'pending' check (status in ('pending','success','failed')),
  paystack_data jsonb,
  ip_address text,
  created_at timestamptz not null default now(),
  verified_at timestamptz
);
create index if not exists idx_tx_status on transactions(status);
create index if not exists idx_tx_nominee on transactions(nominee_id);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references admins(id) on delete set null,
  action text not null,
  details jsonb default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('voting_deadline', '"2026-09-01T00:00:00.000Z"'),
  ('homepage_banner', '{"headline":"2026 Voting Now Open","subtext":"Recognizing American Excellence"}'),
  ('prizes', '["Gold Medallion","National Feature","Verified Badge","Awards Gala Invite"]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Views: the REST API (PostgREST, what supabase-js talks to) can query
-- views just like tables, so joins that the backend needs (nominee +
-- its category name/slug) are expressed here instead of in application
-- code, since supabase-js can't do arbitrary SQL joins itself.
-- ---------------------------------------------------------------------

create or replace view nominee_public as
select
  n.id, n.name, n.state, n.bio, n.photo_url, n.social_links,
  n.votes_count, n.is_active, n.created_at, n.category_id,
  c.name as category_name, c.slug as category_slug
from nominees n
join categories c on c.id = n.category_id;

create or replace view leaderboard_view as
select
  n.id, n.name, n.photo_url, n.votes_count, n.is_active,
  c.name as category_name, c.slug as category_slug,
  rank() over (order by n.votes_count desc) as rank
from nominees n
join categories c on c.id = n.category_id
where n.is_active = true;

create or replace view transaction_admin_view as
select
  t.id, t.reference, t.quantity, t.amount_usd, t.status, t.channel,
  t.voter_email, t.created_at, t.verified_at, t.nominee_id,
  n.name as nominee_name
from transactions t
join nominees n on n.id = t.nominee_id;

create or replace view admin_stats_view as
select
  (select coalesce(sum(votes_count), 0) from nominees) as total_votes,
  (select coalesce(sum(amount_usd), 0) from transactions where status = 'success') as total_revenue_usd,
  (select count(*) from nominees where is_active = true) as total_nominees;

create or replace view transaction_status_counts as
select status, count(*) as count from transactions group by status;

-- ---------------------------------------------------------------------
-- Function: atomically credit a successful payment's votes exactly once.
-- Runs as a single statement from the app's point of view (supabase.rpc),
-- but Postgres wraps the whole function body in one transaction, and
-- "for update" locks the transaction row for that transaction's duration -
-- so if the Paystack webhook and the frontend's verify-poll both fire at
-- nearly the same moment, only one of them actually credits the votes.
-- security definer so it can run with the privileges needed regardless of
-- which role calls it via RPC.
-- ---------------------------------------------------------------------

create or replace function apply_successful_transaction(
  p_reference text,
  p_channel text,
  p_paystack_data jsonb
) returns void as $$
declare
  v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where reference = p_reference for update;

  if not found then
    raise exception 'Transaction not found: %', p_reference;
  end if;

  if v_tx.status = 'success' then
    return; -- already credited - idempotent no-op
  end if;

  update transactions
    set status = 'success', channel = p_channel, paystack_data = p_paystack_data, verified_at = now()
    where id = v_tx.id;

  update nominees
    set votes_count = votes_count + v_tx.quantity, updated_at = now()
    where id = v_tx.nominee_id;
end;
$$ language plpgsql security definer;

-- Row Level Security note: this backend connects with the SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS entirely by design (it's meant for trusted server-side
-- use, never exposed to a browser). RLS policies are not required for this
-- app to function. If you later add anything that queries Supabase directly
-- from the frontend using the anon/public key, add RLS policies before doing
-- that - without them every row would be readable/writable by anyone.
