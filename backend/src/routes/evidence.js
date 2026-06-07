const express = require('express');
const router = express.Router();
const { z } = require('zod');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { runEvidenceChallenge } = require('../services/ragService');

const schema = z.object({
  project_id: z.string().uuid(),
  job_title: z.string().min(1).max(200),
  bullets: z.array(z.string().min(1).max(500)).min(1).max(20),
  language: z.enum(['da', 'en']),
});

router.use(requireAuth);

// POST /api/generate/evidence-challenge
// Runs RAG search + Claude evidence challenge for the user's input.
// Always returns {challenges:[...]} — never errors (graceful degradation).
router.post('/evidence-challenge', aiLimiter, async (req, res, next) => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.json({ challenges: [] });
    }
    const { project_id, job_title, bullets, language } = parsed.data;

    const result = await runEvidenceChallenge({
      bullets,
      jobTitle: job_title,
      language,
      projectId: project_id,
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    // Evidence challenge must never break the main flow
    res.json({ challenges: [] });
    next(err); // Still log to Sentry
  }
});

module.exports = router;
