const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const FROM_EMAIL = 'alerts@jobopslag-generator.dk';

async function sendAlert(subject, body) {
  if (!ADMIN_EMAIL || !process.env.RESEND_API_KEY) {
    console.warn('Alert skipped (missing ADMIN_EMAIL or RESEND_API_KEY):', subject);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject: `[Alert] ${subject}`,
      text: body,
    });
  } catch (err) {
    console.error('Failed to send alert email:', err.message);
  }
}

async function checkAndSendAlerts() {
  const db = require('../db');
  const today = new Date().toISOString().split('T')[0];
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // 1. Daily AI cost > threshold
  const costThresholdCents = (parseFloat(process.env.AI_COST_ALERT_DKK) || 200) * 100;
  const { rows: costRows } = await db.query(
    `SELECT COALESCE(SUM(cost_cents), 0) AS total FROM ai_calls WHERE created_at >= NOW() - INTERVAL '24 hours'`
  );
  if (parseInt(costRows[0].total) > costThresholdCents) {
    await sendAlert(
      'Daily AI cost exceeded threshold',
      `AI spend last 24h: ${(costRows[0].total / 100).toFixed(2)} DKK (threshold: ${process.env.AI_COST_ALERT_DKK} DKK)`
    );
  }

  // 2. Error rate > 5% over last hour
  const { rows: errorRows } = await db.query(
    `SELECT
      COUNT(*) FILTER (WHERE event_type = 'error') AS errors,
      COUNT(*) AS total
     FROM events WHERE created_at >= $1`,
    [hourAgo]
  );
  const errorRate = errorRows[0].total > 0
    ? errorRows[0].errors / errorRows[0].total
    : 0;
  if (parseFloat(errorRate) > 0.05) {
    await sendAlert(
      'Error rate exceeded 5%',
      `Error rate last hour: ${(errorRate * 100).toFixed(1)}% (${errorRows[0].errors}/${errorRows[0].total} events)`
    );
  }

  // 3. Single user with > 50 AI calls in 1 hour
  const { rows: heavyUsers } = await db.query(
    `SELECT user_id, COUNT(*) AS calls
     FROM ai_calls
     WHERE created_at >= $1 AND user_id IS NOT NULL
     GROUP BY user_id
     HAVING COUNT(*) > 50`,
    [hourAgo]
  );
  for (const u of heavyUsers) {
    await sendAlert(
      'User exceeded 50 AI calls in 1 hour',
      `User ${u.user_id} made ${u.calls} AI calls in the last hour`
    );
  }

  // 4. Signups > 50% above previous week average
  const { rows: signupRows } = await db.query(
    `SELECT
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '7 days') AS this_week,
      (SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '14 days'
                                   AND created_at < NOW() - INTERVAL '7 days') AS last_week`
  );
  const thisWeek = parseInt(signupRows[0].this_week);
  const lastWeek = parseInt(signupRows[0].last_week) || 1;
  if (thisWeek / lastWeek > 1.5) {
    await sendAlert(
      'Signup spike detected',
      `New signups this week: ${thisWeek} vs last week: ${lastWeek} (+${((thisWeek / lastWeek - 1) * 100).toFixed(0)}%)`
    );
  }
}

module.exports = { sendAlert, checkAndSendAlerts };
