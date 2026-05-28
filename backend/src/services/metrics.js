const cron = require('node-cron');
const db = require('../db');
const { checkAndSendAlerts } = require('./alerts');

async function computeDailyMetrics(date) {
  const d = date || new Date().toISOString().split('T')[0];

  const { rows } = await db.query(
    `SELECT
      (SELECT COUNT(DISTINCT user_id) FROM events
       WHERE DATE(created_at) = $1 AND event_type = 'login') AS active_users,
      (SELECT COUNT(*) FROM users WHERE DATE(created_at) = $1) AS new_signups,
      (SELECT COUNT(*) FROM projects WHERE tier = 1 AND DATE(created_at) = $1) AS tier1_projects,
      (SELECT COUNT(*) FROM projects WHERE tier = 2 AND DATE(created_at) = $1) AS tier2_projects,
      (SELECT COUNT(*) FROM projects WHERE status = 'completed' AND DATE(updated_at) = $1) AS completed_projects,
      (SELECT COALESCE(SUM(cost_cents), 0) FROM ai_calls WHERE DATE(created_at) = $1) AS ai_cost_cents`,
    [d]
  );

  const m = rows[0];

  // MRR: sum of active paid subscriptions
  const { rows: mrrRows } = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE subscription_tier = 'tier1_monthly') * 19900 +
      COUNT(*) FILTER (WHERE subscription_tier = 'tier2_monthly') * 49900 AS mrr_cents
     FROM users WHERE account_status = 'active'`
  );

  await db.query(
    `INSERT INTO daily_metrics
       (date, active_users, new_signups, tier1_projects, tier2_projects, completed_projects, ai_cost_cents, mrr_cents)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (date) DO UPDATE SET
       active_users = EXCLUDED.active_users,
       new_signups = EXCLUDED.new_signups,
       tier1_projects = EXCLUDED.tier1_projects,
       tier2_projects = EXCLUDED.tier2_projects,
       completed_projects = EXCLUDED.completed_projects,
       ai_cost_cents = EXCLUDED.ai_cost_cents,
       mrr_cents = EXCLUDED.mrr_cents`,
    [
      d,
      m.active_users,
      m.new_signups,
      m.tier1_projects,
      m.tier2_projects,
      m.completed_projects,
      m.ai_cost_cents,
      mrrRows[0].mrr_cents,
    ]
  );

  console.log(`Daily metrics computed for ${d}`);
}

function startMetricsCron() {
  // Run at 02:00 every night
  cron.schedule('0 2 * * *', async () => {
    try {
      await computeDailyMetrics();
      await checkAndSendAlerts();
    } catch (err) {
      console.error('Metrics cron error:', err);
    }
  });
  console.log('Metrics cron job started (runs at 02:00 daily)');
}

module.exports = { startMetricsCron, computeDailyMetrics };
