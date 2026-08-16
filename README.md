# USEA Backend

Express + PostgreSQL API for the United States Excellence Awards voting
platform, using **Supabase's pooled Postgres connection** (`DATABASE_URL` +
`pg`, not the Supabase JS client). Handles nominees, categories, vote
purchases via Paystack (card / Apple Pay / M-Pesa STK push depending on
category), live leaderboard, admin auth, and audit logging. Deploys as its
own Render **Web Service**, separate from the frontend repo.

## ⚠️ Two things to confirm with Paystack before relying on this

1. **USD + Apple Pay**: Paystack's core markets are Nigeria, Ghana, South
   Africa, and Kenya. USD settlement + Apple Pay typically require a
   specifically-enabled business account type. Check Settings → Preferences
   / Payment Channels in your dashboard, or ask Paystack support directly.
2. **M-Pesa (KES)**: the "Best African Youth Leader" category charges in
   KES via M-Pesa STK push (Paystack's `/charge` endpoint with a
   `mobile_money` payload). This is a **separate capability from USD** and
   typically requires a Kenya-registered Paystack business settling in KES.
   If that's not enabled on your account, transactions for that one
   category will fail even though everything else works — confirm this
   before launch, not after.

Every other category uses the standard USD flow; only nominees in the
M-Pesa category are affected by #2.

## What changed recently (for your own reference)

- **Voter email is auto-generated, not collected.** Paystack requires *an*
  email on every charge, but the voter never types one — see
  `generateSyntheticEmail()` in `votes.controller.js`. It uses the
  `.invalid` TLD (reserved by RFC 2606) so it can never resolve to a real
  inbox. Trade-off: there's no real receipt email and no way to contact a
  voter afterward — the UI shouldn't promise either.
- **`preferred_channel`** on `POST /api/votes/initiate` lets the frontend
  put "Pay with Apple Pay" as the primary button and "Pay with card" as a
  secondary one. Both still redirect to Paystack's own hosted checkout —
  this only narrows which channel(s) that page opens with, it doesn't
  change where the actual payment happens.
- **Category-level `payment_mode`** (`standard` or `mpesa`) drives which
  flow `initiateVote` uses. Only set `mpesa` on the one category meant to
  charge in KES via M-Pesa — everything else should stay `standard`.

## Stack

- Node.js + Express
- PostgreSQL via `pg` (Supabase's pooled connection string under the hood)
- JWT admin authentication (`jsonwebtoken` + `bcryptjs`)
- Paystack REST API (`axios`) — `/transaction/initialize` for the standard
  flow, `/charge` for M-Pesa STK push, shared webhook handling for both
- `helmet`, `cors`, `express-rate-limit`, `express-validator` for the security items in the spec

## Project structure

```
server.js                  # app entry, middleware wiring, route mounting
src/
  config/db.js               # pg Pool (Supabase pooled connection string)
  config/paystack.js          # axios client for Paystack REST API
  middleware/
    auth.js                 # requireAuth (JWT) + requireRole
    rateLimiter.js           # general + sensitive-route limits
    validate.js              # express-validator error handler
    errorHandler.js          # centralized error responses
  controllers/               # one file per resource
  routes/                    # one file per resource, validation chains live here
  utils/
    asyncHandler.js
    audit.js                 # writes to audit_logs
db/
  migrations/001_init.sql    # schema, incl. categories.payment_mode and transactions.currency/voter_phone
  seed.sql                   # sample data, incl. the M-Pesa category
scripts/
  migrate.js                 # runs migrations against DATABASE_URL
  seed.js                    # runs seed.sql
  createAdmin.js              # CLI to create/update an admin user
render.yaml                  # Render Blueprint (web service; DB is external/Supabase)
```

## Local setup

```bash
npm install
cp .env.example .env         # fill in DATABASE_URL (Supabase pooled string), JWT_SECRET, Paystack keys
npm run migrate
npm run seed                 # optional - sample categories/nominees, incl. the M-Pesa one
node scripts/createAdmin.js you@example.com "SomeStrongPassword123" superadmin
npm run dev
```

## Deploying: GitHub repo → Render Web Service

1. Push this folder to its own GitHub repo (e.g. `usea-backend`).
2. Render Dashboard → New → Web Service → connect the repo.
   - Build command: `npm install`
   - Start command: `npm start`
   - Or use the included `render.yaml` via Dashboard → New → Blueprint.
3. Set environment variables (Render → Environment): everything in
   `.env.example` — `DATABASE_URL` from Supabase's Connection Pooling tab,
   your real Paystack keys, `CORS_ORIGINS` set to your deployed frontend's URL.
4. Run the migration once the service is live — Render's Shell tab on the
   service: `npm run migrate`, then
   `node scripts/createAdmin.js you@example.com "StrongPassword123" superadmin`.
   (You can also run `npm run migrate` from your own machine against the
   same `DATABASE_URL` before the service is even deployed, since Supabase
   is reachable from anywhere.)
5. Point Paystack's webhook at your Render URL: Paystack dashboard →
   Settings → API Keys & Webhooks →
   `https://<your-render-service>.onrender.com/api/webhooks/paystack`.
6. Point your frontend's Paystack callback at its confirmation page (e.g.
   `https://<your-frontend>.onrender.com/vote-confirm.html`) and set that
   as `PAYSTACK_CALLBACK_URL` here.

Render's free/starter web services spin down when idle — the first request
after idle can take several seconds.

## API overview

**Public**
- `GET /api/categories`
- `GET /api/nominees?search=&category=&state=&sort=votes|newest&page=&limit=` — each nominee includes `category_payment_mode` so the frontend knows which checkout UI to show
- `GET /api/nominees/:id`
- `GET /api/leaderboard?category=&limit=`
- `GET /api/settings`
- `POST /api/votes/initiate` → `{ nominee_id, quantity, name?, preferred_channel?, voter_phone? }`
  - Standard (USD) nominees: returns `{ flow: 'redirect', authorization_url, access_code, reference }`
  - M-Pesa (KES) nominees: **requires** `voter_phone`; returns `{ flow: 'stk_push', status, display_text, reference }` — no redirect, the voter confirms on their phone
- `GET /api/votes/verify/:reference` → polling fallback for both flows
- `POST /api/webhooks/paystack` → Paystack calls this; not for frontend use

**Admin** (`Authorization: Bearer <token>` from `POST /api/auth/login`)
- `POST /api/auth/login`, `GET /api/auth/me`
- `POST/PUT/DELETE /api/categories` (accepts `payment_mode`), `/api/nominees`
- `GET /api/admin/stats` → `revenue_by_currency` is now an array (USD and KES tracked separately — they're different currencies, never summed together)
- `GET /api/admin/transactions?status=&page=&limit=` / `/export.csv` — includes `currency` and `voter_phone` columns
- `GET /api/admin/audit-logs` (superadmin only)
- `PUT /api/settings` → `{ key, value }`

## Security notes / what's covered vs. what to add

Covered: JWT auth, role-based permissions, `helmet` headers, rate limiting,
input validation/sanitization, parameterized SQL everywhere, Paystack
webhook HMAC verification, idempotent vote crediting (row lock prevents
double-counting between the webhook and the verify-poll), audit log of
every admin write.

Left out on purpose:
- **CSRF** — stateless Bearer-token API, standard to skip; add `csurf` only
  if the admin panel moves to cookie sessions.
- **Real voter contact** — by design now (see above). If you later want
  actual receipts, that means collecting a real email again and reversing
  this decision, not adding email-sending on top of a fake address.
- **Photo uploads** — nominees store a `photo_url` string; direct upload
  needs its own object storage (S3/Cloudinary/Supabase Storage), not wired
  up yet.
- **M-Pesa OTP edge cases** — the `/charge` integration handles the normal
  STK-push path; Paystack's Charge API can also return an `send_otp` status
  in some cases requiring a follow-up `/charge/submit_otp` call, which
  isn't handled here yet. Worth adding if you see it happen in practice.
