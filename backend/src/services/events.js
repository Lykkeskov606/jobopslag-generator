const db = require('../db');

async function trackEvent(eventType, userId, eventData = {}) {
  try {
    await db.query(
      'INSERT INTO events (user_id, event_type, event_data) VALUES ($1, $2, $3)',
      [userId || null, eventType, JSON.stringify(eventData)]
    );
  } catch (err) {
    // Event tracking must never crash the main flow
    console.error('Event tracking error:', err.message);
  }
}

module.exports = { trackEvent };
