const { requireAuth } = require('./auth');

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  });
}

module.exports = { requireAdmin };
