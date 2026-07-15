const db = require('../db');
const { usdCentsToDkk } = require('../utils/currency');

// DAILY_BUDGET_ORE is DKK-øre (500 = 5 kr per user per day). ai_calls.cost_cents
// in the DB is USD-cents; the sum is converted to DKK-øre here before comparison
// — see utils/currency.js.
const DAILY_BUDGET_ORE = 500;

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
    const spentOre = usdCentsToDkk(rows[0].total) * 100;
    if (spentOre >= DAILY_BUDGET_ORE) {
      return res.status(429).json({ error: 'Daily AI budget exceeded' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { budgetGuard };
