const db = require('../db');

const DAILY_BUDGET_CENTS = 500; // 5 kr per user per day

// Per-user daily AI budget cap. Must run after requireAuth (needs req.user).
// Superadmin bypasses — same free-usage practice as the payment gates.
async function budgetGuard(req, res, next) {
  try {
    if (req.user?.role === 'superadmin') return next();
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(cost_cents), 0) AS total
       FROM ai_calls
       WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
      [req.user.id]
    );
    if (Number(rows[0].total) >= DAILY_BUDGET_CENTS) {
      return res.status(429).json({ error: 'Daily AI budget exceeded' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { budgetGuard };
