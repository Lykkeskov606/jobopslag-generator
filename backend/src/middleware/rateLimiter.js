const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis } = require('../services/redis');

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI call limit reached (100/hour), please try again later' },
  // Redis-backed store: counters survive restarts/deploys and are shared
  // across instances. Reuses the shared client from services/redis.js.
  store: new RedisStore({
    prefix: 'rl:ai:',
    sendCommand: async (...args) => {
      const client = await getRedis();
      return client.sendCommand(args);
    },
  }),
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests, please try again later' },
});

module.exports = { authLimiter, aiLimiter, resetLimiter };
