require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { apiLimiter } = require('./src/middleware/rateLimiter');
const { errorHandler } = require('./src/middleware/errorHandler');

const webhookRoutes = require('./src/routes/webhook.routes');
const authRoutes = require('./src/routes/auth.routes');
const categoriesRoutes = require('./src/routes/categories.routes');
const nomineesRoutes = require('./src/routes/nominees.routes');
const votesRoutes = require('./src/routes/votes.routes');
const leaderboardRoutes = require('./src/routes/leaderboard.routes');
const settingsRoutes = require('./src/routes/settings.routes');
const adminRoutes = require('./src/routes/admin.routes');

const app = express();

// Render sits behind a proxy - needed for correct req.ip and rate limiting.
app.set('trust proxy', 1);

app.use(helmet());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Allow server-to-server / curl requests with no origin header.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS.'));
  },
  credentials: true,
}));

// IMPORTANT: the Paystack webhook needs the raw, unparsed request body to
// verify its HMAC signature, so it's mounted before express.json() and
// applies its own express.raw() internally (see webhook.routes.js).
app.use('/api/webhooks', webhookRoutes);

app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'usea-backend' }));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/nominees', nomineesRoutes);
app.use('/api/votes', votesRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use(errorHandler);

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`USEA backend listening on port ${PORT}`));
