const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');
const db = require('../db');
const { getRedis } = require('../services/redis');
const { trackEvent } = require('../services/events');
const { authLimiter } = require('../middleware/rateLimiter');

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

module.exports = router;
