const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/requireAdmin');
const { computeDailyMetrics } = require('../services/metrics');
const { usdCentsToDkk } = require('../utils/currency');

router.use(requireAdmin);

function parseDays(req) {
  const n = parseInt(req.query.days, 10);
  return (!isNaN(n) && n >= 1 && n <= 365) ? n : 30;
}

// GET /api/admin/business — KPIs
router.get('/business', async (req, res, next) => {
  try {
    const days = parseDays(req);

    const [users, projects, revenue, topUsers] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - $1 * INTERVAL '1 day') AS new_signups,
          COUNT(*) FILTER (WHERE last_login >= NOW() - $1 * INTERVAL '1 day') AS active_users,
          COUNT(*) FILTER (WHERE subscription_tier != 'free') AS paid_users,
          COUNT(*) FILTER (WHERE subscription_tier = 'tier1_monthly') AS tier1_monthly,
          COUNT(*) FILTER (WHERE subscription_tier = 'tier2_monthly') AS tier2_monthly
        FROM users WHERE account_status = 'active'
      `, [days]),
      db.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE tier = 1) AS tier1,
          COUNT(*) FILTER (WHERE tier = 2) AS tier2,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed,
          COUNT(*) FILTER (WHERE created_at >= NOW() - $1 * INTERVAL '1 day') AS recent,
          ROUND(
            COUNT(*) FILTER (WHERE status = 'completed')::numeric /
            NULLIF(COUNT(*), 0) * 100, 1
          ) AS completion_rate_pct,
          COUNT(*) FILTER (WHERE output_language = 'da') AS lang_da,
          COUNT(*) FILTER (WHERE output_language = 'en') AS lang_en
        FROM projects
      `, [days]),
      db.query(`
        SELECT
          SUM(CASE WHEN subscription_tier = 'tier1_monthly' THEN 19900 ELSE 0 END +
              CASE WHEN subscription_tier = 'tier2_monthly' THEN 49900 ELSE 0 END) AS mrr_cents
        FROM users WHERE account_status = 'active' AND subscription_tier != 'free'
      `),
      db.query(`
        SELECT u.id, u.email, COUNT(p.id) AS project_count
        FROM users u
        JOIN projects p ON p.owner_id = u.id
        GROUP BY u.id, u.email
        ORDER BY project_count DESC
        LIMIT 20
      `),
    ]);

    res.json({
      users: users.rows[0],
      projects: projects.rows[0],
      mrr_cents: revenue.rows[0].mrr_cents || 0,
      top_users: topUsers.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/operational — system health + AI cost
router.get('/operational', async (req, res, next) => {
  try {
    const days = parseDays(req);

    const [aiCost, latency, topErrors] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
          ROUND(AVG(cost_cents), 0) AS avg_cost_cents,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY cost_cents) AS median_cost_cents,
          COUNT(*) AS total_calls,
          output_type
        FROM ai_calls ac
        LEFT JOIN project_outputs po ON po.project_id = ac.project_id
        WHERE ac.created_at >= NOW() - $1 * INTERVAL '1 day'
        GROUP BY output_type
        ORDER BY total_cost_cents DESC
      `, [days]),
      db.query(`
        SELECT
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99,
          AVG(latency_ms) AS avg_ms
        FROM ai_calls
        WHERE created_at >= NOW() - $1 * INTERVAL '1 day' AND latency_ms IS NOT NULL
      `, [days]),
      db.query(`
        SELECT event_data->>'error' AS error_type, COUNT(*) AS occurrences
        FROM events
        WHERE event_type = 'error' AND created_at >= NOW() - $1 * INTERVAL '1 day'
        GROUP BY error_type
        ORDER BY occurrences DESC
        LIMIT 10
      `, [days]),
    ]);

    // cost_cents is USD-cents — convert to DKK/øre here so the frontend never
    // needs to know the exchange rate (see utils/currency.js).
    res.json({
      ai_cost: aiCost.rows.map((r) => ({
        ...r,
        total_cost_dkk: usdCentsToDkk(r.total_cost_cents),
        avg_cost_ore: r.avg_cost_cents == null ? null : usdCentsToDkk(r.avg_cost_cents) * 100,
      })),
      latency: latency.rows[0],
      top_errors: topErrors.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/product — bias rules, funnel, output quality
router.get('/product', async (req, res, next) => {
  try {
    const days = parseDays(req);

    const [biasStats, funnelData, outputQuality] = await Promise.all([
      db.query(`
        SELECT
          rule_triggered,
          COUNT(*) AS total_triggers,
          COUNT(*) FILTER (WHERE user_action = 'resolved') AS resolved,
          COUNT(*) FILTER (WHERE user_action = 'ignored') AS ignored,
          ROUND(
            COUNT(*) FILTER (WHERE user_action = 'resolved')::numeric /
            NULLIF(COUNT(*), 0) * 100, 1
          ) AS resolve_rate_pct
        FROM bias_violations
        WHERE created_at >= NOW() - $1 * INTERVAL '1 day'
        GROUP BY rule_triggered
        ORDER BY total_triggers DESC
        LIMIT 20
      `, [days]),
      db.query(`
        SELECT
          completion_step,
          COUNT(*) AS projects_at_step,
          ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60), 0) AS median_minutes
        FROM projects
        WHERE tier = 2 AND created_at >= NOW() - $1 * INTERVAL '1 day'
        GROUP BY completion_step
        ORDER BY completion_step
      `, [days]),
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'completed') AS downloaded,
          COUNT(*) AS total,
          ROUND(COUNT(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(COUNT(*), 0) * 100, 1) AS download_rate_pct
        FROM projects
        WHERE created_at >= NOW() - $1 * INTERVAL '1 day'
      `, [days]),
    ]);

    res.json({
      bias_stats: biasStats.rows,
      funnel: funnelData.rows,
      output_quality: outputQuality.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/metrics-history — daily_metrics table
router.get('/metrics-history', async (req, res, next) => {
  try {
    const days = parseDays(req);
    const { rows } = await db.query(
      `SELECT * FROM daily_metrics
       WHERE date >= CURRENT_DATE - $1 * INTERVAL '1 day'
       ORDER BY date DESC`,
      [days]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/compute-metrics — manual trigger
router.post('/compute-metrics', async (req, res, next) => {
  try {
    await computeDailyMetrics(req.body.date);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/projects — list all projects for admin management
router.get('/projects', async (req, res, next) => {
  try {
    const filter = req.query.filter || 'active'; // 'active' | 'deleted' | 'all'
    const whereClause =
      filter === 'deleted' ? 'AND p.deleted_at IS NOT NULL' :
      filter === 'all'     ? '' :
      'AND p.deleted_at IS NULL';

    const { rows } = await db.query(
      `SELECT p.id, p.name, p.tier, p.status, p.output_language,
              p.completion_step, p.created_at, p.updated_at, p.deleted_at,
              u.email AS owner_email
       FROM projects p
       JOIN users u ON u.id = p.owner_id
       WHERE true ${whereClause}
       ORDER BY p.updated_at DESC
       LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/projects/:id/restore — admin can restore any soft-deleted project
router.patch('/projects/:id/restore', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `UPDATE projects
       SET deleted_at = NULL, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NOT NULL
       RETURNING id, name`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found in trash' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
