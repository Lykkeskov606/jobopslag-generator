const express = require('express');
const router = express.Router();
const { healthCheck } = require('../db');
const { redisHealthCheck } = require('../services/redis');

router.get('/', async (req, res) => {
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  let httpStatus = 200;

  try {
    await healthCheck();
    status.services.postgres = 'ok';
  } catch (err) {
    status.services.postgres = 'error';
    status.status = 'degraded';
    httpStatus = 503;
  }

  try {
    await redisHealthCheck();
    status.services.redis = 'ok';
  } catch (err) {
    status.services.redis = 'error';
    status.status = 'degraded';
    httpStatus = 503;
  }

  res.status(httpStatus).json(status);
});

module.exports = router;
