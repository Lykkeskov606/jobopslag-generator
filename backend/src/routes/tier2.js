const express = require('express');
const router = express.Router();
const { z } = require('zod');
const multer = require('multer');
const mammoth = require('mammoth');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { generateFitCriteria, challengeJobAnalysisAnswer, generateBehaviorPatterns, generateJobPosting, generateCandidateProfile, generateInterviewGuide } = require('../services/claudeService');
const { runBiasCheck, checkTierC } = require('../services/biasEngine');
const db = require('../db');

router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.docx') || name.endsWith('.pdf')) cb(null, true);
    else cb(new Error('Only .docx or .pdf files accepted'));
  },
});

// ── Membership helper ─────────────────────────────────────────────────────────

async function isMember(projectId, userId) {
  const { rows } = await db.query(
    `SELECT 1 FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.project_id = $1 AND pm.user_id = $2
       AND p.deleted_at IS NULL`,
    [projectId, userId]
  );
  return rows.length > 0;
}

// ── GET /api/tier2/:projectId — load all saved steps ─────────────────────────

router.get('/:projectId', async (req, res, next) => {
  try {
    if (!(await isMember(req.params.projectId, req.user.id))) {
      return res.status(404).json({ error: 'Not found' });
    }
    const { rows } = await db.query(
      `SELECT step_number, input_data FROM project_inputs
       WHERE project_id = $1 ORDER BY step_number`,
      [req.params.projectId]
    );
    const steps = {};
    for (const row of rows) steps[row.step_number] = row.input_data;
    res.json({ steps });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/save-step ─────────────────────────────────────────────────

router.post('/save-step', async (req, res, next) => {
  try {
    const schema = z.object({
      project_id:  z.string().uuid(),
      step_number: z.number().int().min(1).max(9),
      input_data:  z.record(z.unknown()),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id, step_number, input_data } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.query(
      `INSERT INTO project_inputs (project_id, step_number, input_data, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (project_id, step_number)
       DO UPDATE SET input_data = $3, updated_at = NOW()`,
      [project_id, step_number, JSON.stringify(input_data)]
    );
    await db.query(
      `UPDATE projects SET completion_step = $1, updated_at = NOW() WHERE id = $2`,
      [step_number, project_id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/parse-template ───────────────────────────────────────────

router.post('/parse-template', (req, res, next) => {
  upload.single('template')(req, res, async (multerErr) => {
    if (multerErr) {
      const message = multerErr.code === 'LIMIT_FILE_SIZE'
        ? 'Filen er for stor. Maks. 5 MB er tilladt.'
        : 'Kunne ikke uploade filen. Prøv igen.';
      return res.status(400).json({ error: 'TEMPLATE_PARSE_FAILED', message });
    }

    try {
      if (!req.file) return res.json({ templateText: null, filename: null });

      let text = '';
      if (req.file.originalname.toLowerCase().endsWith('.docx')) {
        const { value } = await mammoth.extractRawText({ buffer: req.file.buffer });
        text = value.slice(0, 3000);
      } else {
        // PDF: basic text extraction — PDF.js not available server-side
        text = req.file.buffer.toString('latin1').replace(/[^\x20-\x7E\n\r]/g, ' ').slice(0, 3000);
        const meaningful = text.replace(/\s+/g, ' ').trim();
        if (meaningful.length < 50) {
          return res.status(400).json({
            error: 'TEMPLATE_PARSE_FAILED',
            message: 'PDF\'en ser ud til at være scannet og indeholder ikke læsbar tekst. Prøv en .docx-fil eller spring over.',
          });
        }
      }

      const trimmed = text.trim();
      if (!trimmed) {
        return res.status(400).json({
          error: 'TEMPLATE_PARSE_FAILED',
          message: 'Kunne ikke læse template-filen. Prøv en anden fil eller spring over.',
        });
      }

      res.json({ templateText: trimmed, filename: req.file.originalname });
    } catch (err) {
      res.status(400).json({
        error: 'TEMPLATE_PARSE_FAILED',
        message: 'Kunne ikke læse template-filen. Prøv en anden fil eller spring over.',
      });
    }
  });
});

// ── POST /api/tier2/fit-criteria — AI generates fit criteria ─────────────────

router.post('/fit-criteria', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      project_id:       z.string().uuid(),
      job_title:        z.string().min(1).max(200),
      department:       z.string().max(200).optional().default(''),
      team_composition: z.string().max(500).optional().default(''),
      language:         z.enum(['da', 'en']),
      bullets:          z.array(z.string().max(500)).max(20).optional().default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id, job_title, department, team_composition, language, bullets } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await generateFitCriteria({
      jobTitle: job_title,
      department,
      teamComposition: team_composition,
      language,
      projectId: project_id,
      userId: req.user.id,
      bullets,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/challenge-answer — AI challenges job analysis answer ─────

router.post('/challenge-answer', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      project_id:    z.string().uuid(),
      question_type: z.enum(['best', 'worst', 'hidden']),
      answer:        z.string().min(1).max(1000),
      language:      z.enum(['da', 'en']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ challenge: null });
    const { project_id, question_type, answer, language } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) return res.json({ challenge: null });
    if (answer.trim().length < 25) return res.json({ challenge: null });

    const result = await challengeJobAnalysisAnswer({
      questionType: question_type,
      answer,
      language,
      projectId: project_id,
      userId: req.user.id,
    });

    res.json(result);
  } catch (err) {
    res.json({ challenge: null });
  }
});

// ── POST /api/tier2/check-fit-bias — bias check on fit criteria fields ───────

router.post('/check-fit-bias', async (req, res, next) => {
  try {
    const schema = z.object({
      project_id: z.string().uuid(),
      text:       z.string().max(500),
      language:   z.enum(['da', 'en']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.json({ warnings: [] });
    const { project_id, text, language } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) return res.json({ warnings: [] });

    const warnings = await runBiasCheck(text, language, project_id, req.user.id, 3);
    res.json({ warnings });
  } catch (err) {
    res.json({ warnings: [] });
  }
});

// ── POST /api/tier2/generate-behaviors — AI generates 5 behavior patterns ────

router.post('/generate-behaviors', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      project_id: z.string().uuid(),
      language:   z.enum(['da', 'en']),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id, language } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { rows } = await db.query(
      `SELECT step_number, input_data FROM project_inputs
       WHERE project_id = $1 AND step_number IN (3, 4, 5)`,
      [project_id]
    );
    const steps = {};
    for (const row of rows) steps[row.step_number] = row.input_data;

    const fitCriteria    = steps[3]?.fitCriteria || {};
    const candidateProfile = steps[4]?.requirements || [];
    const jobAnalysis    = {
      best:   steps[5]?.best   || '',
      worst:  steps[5]?.worst  || '',
      hidden: steps[5]?.hidden || '',
    };

    const patterns = await generateBehaviorPatterns({
      fitCriteria, candidateProfile, jobAnalysis, language,
      projectId: project_id, userId: req.user.id,
    });

    const existingRow = await db.query(
      `SELECT input_data FROM project_inputs WHERE project_id = $1 AND step_number = 6`,
      [project_id]
    );
    const existingSelected = existingRow.rows[0]?.input_data?.selected || [];

    await db.query(
      `INSERT INTO project_inputs (project_id, step_number, input_data, updated_at)
       VALUES ($1, 6, $2, NOW())
       ON CONFLICT (project_id, step_number)
       DO UPDATE SET input_data = $2, updated_at = NOW()`,
      [project_id, JSON.stringify({ patterns, selected: existingSelected })]
    );

    res.json({ patterns });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/save-behaviors — save selected behavior patterns (3–4) ───

router.post('/save-behaviors', async (req, res, next) => {
  try {
    const patternItem = z.object({
      id:          z.string().optional(),
      source:      z.enum(['ai', 'user']).optional(),
      title:       z.string(),
      description: z.string(),
      edited:      z.boolean().optional(),
    });
    const schema = z.object({
      project_id: z.string().uuid(),
      patterns:   z.array(patternItem).min(5).max(10),
      selected:   z.array(patternItem).min(3).max(4),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input — select 3 or 4 patterns, minimum 5 total patterns required' });
    const { project_id, patterns, selected } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await db.query(
      `INSERT INTO project_inputs (project_id, step_number, input_data, updated_at)
       VALUES ($1, 6, $2, NOW())
       ON CONFLICT (project_id, step_number)
       DO UPDATE SET input_data = $2, updated_at = NOW()`,
      [project_id, JSON.stringify({ patterns, selected })]
    );
    await db.query(
      `UPDATE projects SET completion_step = 6, updated_at = NOW() WHERE id = $1`,
      [project_id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/generate-job-posting — generate 2 job posting variants ────

router.post('/generate-job-posting', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({
      project_id:    z.string().uuid(),
      extra_bullets: z.array(z.string().max(300)).max(10).optional().default([]),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id, extra_bullets } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { rows } = await db.query(
      `SELECT step_number, input_data FROM project_inputs
       WHERE project_id = $1 AND step_number IN (1, 2, 3, 4, 5, 6)`,
      [project_id]
    );
    const steps = {};
    for (const row of rows) steps[row.step_number] = row.input_data;

    const step1 = steps[1] || {};
    const step2 = steps[2] || {};
    const step3 = steps[3] || {};
    const step4 = steps[4] || {};
    const step5 = steps[5] || {};
    const step6 = steps[6] || {};

    const jobTitle       = step2.jobTitle || '';
    const language       = step2.outputLanguage || 'da';
    const location       = step2.location || '';
    const startDate      = step2.startDate || '';
    const employmentType = step2.employmentType || '';

    const baseBullets = (step2.bullets || []).filter((b) => b?.trim());
    const bullets = [...baseBullets, ...extra_bullets.filter((b) => b?.trim())];

    const templateContent   = step1.templateText || null;
    const fitCriteria       = step3.fitCriteria || {};
    const candidateProfile  = step4.requirements || [];
    const jobAnalysis       = { best: step5.best || '', worst: step5.worst || '', hidden: step5.hidden || '' };
    const behaviorPatterns  = step6.selected || [];

    const { variant_a, variant_b } = await generateJobPosting({
      jobTitle, bullets, language,
      templateContent, templateHtml: null,
      location, startDate, employmentType,
      fitCriteria, candidateProfile, jobAnalysis, behaviorPatterns,
      projectId: project_id, userId: req.user.id,
    });

    const tierCWarningsA = checkTierC(variant_a, language).map((w) => ({ ...w, source: 'variant_a' }));
    const tierCWarningsB = checkTierC(variant_b, language).map((w) => ({ ...w, source: 'variant_b' }));

    const batchId = require('crypto').randomUUID();
    for (const [variant, content] of [['A', variant_a], ['B', variant_b]]) {
      await db.query(
        `INSERT INTO project_outputs
           (project_id, output_type, variant, content, language, ai_model_version, generation_batch)
         VALUES ($1, 'jobopslag', $2, $3, $4, 'claude-sonnet-4-6', $5)`,
        [project_id, variant, content, language, batchId]
      );
    }

    await db.query(
      `UPDATE projects SET completion_step = 7, updated_at = NOW() WHERE id = $1`,
      [project_id]
    );

    res.json({
      variant_a,
      variant_b,
      bias_warnings: [...tierCWarningsA, ...tierCWarningsB],
      generation_batch: batchId,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/generate-candidate-profile ────────────────────────────────

router.post('/generate-candidate-profile', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ project_id: z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { rows: inputRows } = await db.query(
      `SELECT step_number, input_data FROM project_inputs
       WHERE project_id = $1 AND step_number IN (2, 3, 4, 5, 6)`,
      [project_id]
    );
    const steps = {};
    for (const row of inputRows) steps[row.step_number] = row.input_data;

    const { rows: outputRows } = await db.query(
      `SELECT content FROM project_outputs
       WHERE project_id = $1 AND output_type = 'jobopslag' AND variant = 'A'
       ORDER BY generated_at DESC LIMIT 1`,
      [project_id]
    );

    const step2 = steps[2] || {};
    const step3 = steps[3] || {};
    const step4 = steps[4] || {};
    const step5 = steps[5] || {};
    const step6 = steps[6] || {};
    const language = step2.outputLanguage || 'da';

    const content = await generateCandidateProfile({
      jobTitle:         step2.jobTitle || '',
      bullets:          (step2.bullets || []).filter(Boolean),
      fitCriteria:      step3.fitCriteria || {},
      candidateProfile: step4.requirements || [],
      jobAnalysis:      { best: step5.best || '', worst: step5.worst || '', hidden: step5.hidden || '' },
      behaviorPatterns: step6.selected || [],
      finalJobPosting:  outputRows[0]?.content || '',
      language,
      projectId:        project_id,
      userId:           req.user.id,
    });

    await db.query(
      `INSERT INTO project_outputs
         (project_id, output_type, variant, content, language, ai_model_version)
       VALUES ($1, 'candidate_profile', 'A', $2, $3, 'claude-sonnet-4-6')`,
      [project_id, content, language]
    );

    await db.query(
      `UPDATE projects SET completion_step = 8, updated_at = NOW() WHERE id = $1`,
      [project_id]
    );

    res.json({ content });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/tier2/generate-interview-guide ──────────────────────────────────

router.post('/generate-interview-guide', aiLimiter, async (req, res, next) => {
  try {
    const schema = z.object({ project_id: z.string().uuid() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { project_id } = parsed.data;

    if (!(await isMember(project_id, req.user.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { rows: inputRows } = await db.query(
      `SELECT step_number, input_data FROM project_inputs
       WHERE project_id = $1 AND step_number IN (4, 6)`,
      [project_id]
    );
    const steps = {};
    for (const row of inputRows) steps[row.step_number] = row.input_data;

    const step2Row = await db.query(
      `SELECT input_data FROM project_inputs WHERE project_id = $1 AND step_number = 2`,
      [project_id]
    );
    const language = step2Row.rows[0]?.input_data?.outputLanguage || 'da';

    const step4 = steps[4] || {};
    const step6 = steps[6] || {};

    const guide = await generateInterviewGuide({
      behaviorPatterns: step6.selected || [],
      candidateProfile: step4.requirements || [],
      language,
      projectId:        project_id,
      userId:           req.user.id,
    });

    const content = JSON.stringify(guide);
    await db.query(
      `INSERT INTO project_outputs
         (project_id, output_type, variant, content, language, ai_model_version)
       VALUES ($1, 'interview_guide', 'A', $2, $3, 'claude-sonnet-4-6')`,
      [project_id, content, language]
    );

    res.json({ guide });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
