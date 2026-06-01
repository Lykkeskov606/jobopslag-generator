const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const db = require('../db');
const { getRedis } = require('../services/redis');
const { trackEvent } = require('../services/events');
const { authLimiter, resetLimiter } = require('../middleware/rateLimiter');
const { requireAuth } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/emails');

const BCRYPT_ROUNDS = 12;
const ACCESS_TTL = 15 * 60; // 15 minutes
const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 days

function signAccess(payload) {
  return jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(payload) {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid email or password (min 8 characters)' });
    }
    const { email, password } = parsed.data;

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2)
       RETURNING id, email, role, subscription_tier, preferred_output_language`,
      [email.toLowerCase(), password_hash]
    );
    const user = rows[0];

    await trackEvent('signup', user.id, { email: user.email });

    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const accessToken = signAccess(tokenPayload);
    const refreshToken = signRefresh(tokenPayload);
    const jti = uuidv4();

    const redis = await getRedis();
    await redis.set(`refresh:${user.id}:${jti}`, refreshToken, { EX: REFRESH_TTL });

    res.status(201).json({
      user: { id: user.id, email: user.email, role: user.role, subscription_tier: user.subscription_tier },
      accessToken,
      refreshToken: `${user.id}:${jti}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    const { email, password } = parsed.data;

    const { rows } = await db.query(
      'SELECT id, email, role, password_hash, account_status, subscription_tier FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (rows.length === 0) {
      await new Promise((r) => setTimeout(r, 200)); // timing-safe
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (user.account_status !== 'active') {
      return res.status(403).json({ error: 'Account is suspended' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await trackEvent('login', user.id);

    const tokenPayload = { id: user.id, email: user.email, role: user.role };
    const accessToken = signAccess(tokenPayload);
    const jti = uuidv4();
    const refreshToken = signRefresh(tokenPayload);

    const redis = await getRedis();
    await redis.set(`refresh:${user.id}:${jti}`, refreshToken, { EX: REFRESH_TTL });

    res.json({
      user: { id: user.id, email: user.email, role: user.role, subscription_tier: user.subscription_tier },
      accessToken,
      refreshToken: `${user.id}:${jti}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Missing refresh token' });

    const [userId, jti] = refreshToken.split(':');
    if (!userId || !jti) return res.status(401).json({ error: 'Invalid refresh token format' });

    const redis = await getRedis();
    const stored = await redis.get(`refresh:${userId}:${jti}`);
    if (!stored) return res.status(401).json({ error: 'Refresh token expired or revoked' });

    let payload;
    try {
      payload = jwt.verify(stored, process.env.JWT_REFRESH_SECRET);
    } catch {
      await redis.del(`refresh:${userId}:${jti}`);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Rotate: delete old, issue new
    await redis.del(`refresh:${userId}:${jti}`);

    const tokenPayload = { id: payload.id, email: payload.email, role: payload.role };
    const newAccessToken = signAccess(tokenPayload);
    const newJti = uuidv4();
    const newRefreshToken = signRefresh(tokenPayload);
    await redis.set(`refresh:${payload.id}:${newJti}`, newRefreshToken, { EX: REFRESH_TTL });

    res.json({
      accessToken: newAccessToken,
      refreshToken: `${payload.id}:${newJti}`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const [userId, jti] = refreshToken.split(':');
      if (userId && jti) {
        const redis = await getRedis();
        await redis.del(`refresh:${userId}:${jti}`);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', resetLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';

    // Always return the same response — never reveal whether an email exists
    if (email) {
      const { rows } = await db.query(
        `SELECT id FROM users WHERE email = $1 AND account_status = 'active'`,
        [email]
      );
      if (rows.length > 0) {
        const userId = rows[0].id;

        // Invalidate any existing unused tokens for this user
        await db.query(
          `DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL`,
          [userId]
        );

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
          [userId, tokenHash, expiresAt]
        );

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${rawToken}`;
        await sendPasswordResetEmail(email, resetLink);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', resetLimiter, async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Invalid reset link' });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { rows } = await db.query(
      `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = $1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset link' });
    }

    const record = rows[0];

    if (record.used_at !== null) {
      return res.status(400).json({ error: 'This reset link has already been used' });
    }
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This reset link has expired — request a new one' });
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, record.user_id]);
    await db.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [record.id]);

    // Invalidate all active sessions so the old password can't be reused via tokens
    try {
      const redis = await getRedis();
      const keys = await redis.keys(`refresh:${record.user_id}:*`);
      if (keys.length > 0) await redis.del(keys);
    } catch {
      // Non-fatal — sessions will expire naturally
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/auth/change-password  (requires login)
router.put('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const { rows } = await db.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const password_hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [password_hash, req.user.id]);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
