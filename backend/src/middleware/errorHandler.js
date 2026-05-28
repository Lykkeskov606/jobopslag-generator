const Sentry = require('@sentry/node');

function errorHandler(err, req, res, next) {
  Sentry.captureException(err);
  console.error(err);

  const status = err.status || 500;
  const message = status < 500 ? err.message : 'An unexpected error occurred. Please try again.';

  res.status(status).json({ error: message });
}

module.exports = { errorHandler };
