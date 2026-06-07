const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { runBulletChallenges } = require('../services/bulletChallengeService');

const schema = z.object({
  project_id: z.string().uuid(),
  job_title: z.string().min(1).max(200),
  bullets: z.array(z.string().max(500)).min(1).max(20),
  language: z.enum(['da', 'en']),
});

router.use(requireAuth);

// POST /api/generate/bullet-challenges
// Per-bullet evidence + qualification challenges. Never errors — graceful degradation.
router.post('/bullet-challenges', aiLimiter, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ challenges: [] });
    const { project_id, job_title, bullets, language } = parsed.data;
    const result = await runBulletChallenges({
      bullets, jobTitle: job_title, language,
      projectId: project_id, userId: req.user.id,
    });
    res.json(result);
  } catch (err) {
    res.json({ challenges: [] });
    next(err);
  }
});

module.exports = router;
