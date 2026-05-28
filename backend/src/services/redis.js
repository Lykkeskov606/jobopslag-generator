const { createClient } = require('redis');

let client;

async function getRedis() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
    client.on('error', (err) => console.error('Redis error:', err));
    await client.connect();
  }
  return client;
}

async function redisHealthCheck() {
  const r = await getRedis();
  await r.ping();
  return true;
}

module.exports = { getRedis, redisHealthCheck };
