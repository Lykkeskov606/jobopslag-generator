require('dotenv').config();
const Sentry = require('@sentry/node');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

// Sentry must init before everything else
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: 0.1,
});

const app = express();

// Security headers
app.use(helmet());

// CORS — only allow whitelisted origins
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));

// Routes
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/generate', require('./routes/generate'));
app.use('/api/generate', require('./routes/bulletChallenges'));
app.use('/api/export', require('./routes/export'));

// Sentry error handler (must come before custom errorHandler)
Sentry.setupExpressErrorHandler(app);

// Custom error handler
app.use(require('./middleware/errorHandler').errorHandler);

// Start services
const { startMetricsCron } = require('./services/metrics');
const { migrate } = require('./db/migrate');

const PORT = process.env.PORT || 3001;

(async () => {
  if (process.env.NODE_ENV !== 'test') {
    await migrate();
    startMetricsCron();
  }
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
})();

module.exports = app;
