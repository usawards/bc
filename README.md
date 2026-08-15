# USEA Backend

Express + PostgreSQL API for the United States Excellence Awards voting platform.
Handles nominees, categories, vote purchases via Paystack, live leaderboard,
admin auth, and audit logging. Designed to deploy as its own Render **Web
Service**, separate from the Next.js frontend repo.

## ⚠️ Read this before you deploy: Paystack currency support

Paystack's core markets are Nigeria, Ghana, South Africa, and Kenya. **USD
transactions require a Paystack business account specifically enabled for USD
settlement** (typically an international/ISO business profile) — a standard
US-only setup may not have USD or Apple Pay available by default. Before
building further on this:

1. Log into your Paystack dashboard → Settings → Preferences, and confirm USD
   is an active currency on your account.
2. Confirm Apple Pay is enabled for your account (Settings → Payment
   Channels) — it requires domain verification (Settings → Apple Pay →
   register your frontend domain) before it will actually render at checkout.
3. If USD isn't available on your account, you'll need to either apply for
   it with Paystack support, or reconsider the processor (e.g. Stripe has
   native, first-class USD + Apple Pay support for US businesses). The code
   here is written against Paystack per your request, but this is worth
   confirming with Paystack directly first so you're not blocked after the
   integration is built.

## Stack

- Node.js + Express
- PostgreSQL (raw SQL via `pg`, no ORM)
- JWT admin authentication (`jsonwebtoken` + `bcryptjs`)
- Paystack REST API (`axios`) for checkout + webhook verification
- `helmet`, `cors`, `express-rate-limit`, `express-validator` for the security items in the spec

## Project structure

```
server.js                  # app entry, middleware wiring, route mounting
src/
  config/db.js              # pg Pool
  config/paystack.js        # axios client for Paystack REST API
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
  migrations/001_init.sql    # schema
  seed.sql                   # optional demo data
scripts/
  migrate.js                 # runs migrations
  seed.js                    # runs seed.sql
  createAdmin.js              # CLI to create/update an admin user
render.yaml                  # Render Blueprint (web service + Postgres)
```

## Local setup

```bash
npm install
cp .env.example .env         # fill in DATABASE_URL, JWT_SECRET, Paystack keys
npm run migrate
npm run seed                 # optional - sample categories/nominees
node scripts/createAdmin.js you@example.com "SomeStrongPassword123" superadmin
npm run dev
```

Server runs on `http://localhost:10000` (or whatever `PORT` you set).

## Deploying: GitHub repo → Render Web Service

1. **Push this folder to its own GitHub repo** (e.g. `usea-backend`). This
   repo should contain *only* the backend — keep the frontend in its own
   repo, since you're deploying them separately.
2. **Create a Postgres instance on Render**: Dashboard → New → PostgreSQL.
   Copy the "Internal Database URL" once it's provisioned.
3. **Create the Web Service**: Dashboard → New → Web Service → connect the
   GitHub repo.
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Or skip steps 2–3 entirely and use `render.yaml` via Dashboard → New →
     Blueprint, which provisions both together.
4. **Set environment variables** on the Web Service (Render dashboard →
   Environment): everything in `.env.example`, using the Postgres Internal
   Database URL for `DATABASE_URL`, your real Paystack keys, and
   `CORS_ORIGINS` set to your deployed frontend's URL (comma-separated if
   there's more than one, e.g. a Vercel preview + production domain).
5. **Run the migration once the service is live.** Render's dashboard gives
   you a Shell tab on the web service — run `npm run migrate`, then
   `node scripts/createAdmin.js you@example.com "StrongPassword123" superadmin`.
6. **Point Paystack's webhook at your Render URL**: Paystack dashboard →
   Settings → API Keys & Webhooks → set the webhook URL to
   `https://<your-render-service>.onrender.com/api/webhooks/paystack`.
7. **Point your frontend's Paystack callback** at whatever page in the
   frontend repo should show the "vote confirmed" screen, and set that URL
   as `PAYSTACK_CALLBACK_URL` here.

Render's free/starter web services spin down when idle, which means the
*first* request after idle can take several seconds (cold start) — fine for
a demo, worth upgrading the plan before a real vote-count-driven traffic
spike (e.g. results day).

## API overview

**Public**
- `GET /api/categories`
- `GET /api/nominees?search=&category=&state=&sort=votes|newest&page=&limit=`
- `GET /api/nominees/:id`
- `GET /api/leaderboard?category=&limit=`
- `GET /api/settings`
- `POST /api/votes/initiate` → `{ nominee_id, quantity, email, name? }` returns a Paystack `authorization_url` to redirect the browser to (or use `access_code` with Paystack's inline/popup JS on the frontend for a no-redirect flow)
- `GET /api/votes/verify/:reference` → polling fallback after Paystack redirects back
- `POST /api/webhooks/paystack` → Paystack calls this; not for frontend use

**Admin** (`Authorization: Bearer <token>` from `POST /api/auth/login`)
- `POST /api/auth/login`, `GET /api/auth/me`
- `POST/PUT/DELETE /api/categories`, `/api/nominees`
- `GET /api/admin/stats`
- `GET /api/admin/transactions?status=&page=&limit=`
- `GET /api/admin/transactions/export.csv`
- `GET /api/admin/audit-logs` (superadmin only)
- `PUT /api/settings` → `{ key, value }`

## Security notes / what's covered vs. what to add

Covered here: JWT auth, role-based permissions (`superadmin` / `editor`),
`helmet` security headers, rate limiting (general + tighter on login/vote
endpoints), input validation + sanitization via `express-validator`,
parameterized SQL everywhere (no string-built queries, so no SQL injection
surface), Paystack webhook HMAC signature verification, idempotent vote
crediting (a Postgres row lock prevents double-counting if the webhook and
the verify-fallback both fire), and an audit log of every admin write.

Deliberately left out, worth adding before this handles real traffic:
- **CSRF**: not implemented, because this API is stateless (Bearer token in
  an `Authorization` header, not a cookie), which is the standard way to
  sidestep CSRF for token-based APIs. If you switch the admin panel to
  cookie-based sessions, add `csurf` at that point.
- **Photo uploads**: nominee photos are stored as a `photo_url` string
  (i.e. the admin panel would need to upload to something like Cloudinary
  or S3 first, then save the resulting URL here). Wiring up direct file
  upload (multer + object storage) is a reasonable next step but needs its
  own storage credentials, so it's left out for now.
- **HTTPS enforcement**: Render terminates TLS for you automatically, so
  there's nothing to add here — just don't disable it in the Render
  dashboard.
