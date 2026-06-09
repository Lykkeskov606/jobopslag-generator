const express = require('express');
const router = express.Router();
const multer = require('multer');
const { z } = require('zod');
const mammoth = require('mammoth');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimiter');
const { runBiasCheck, checkTierC } = require('../services/biasEngine');
const { generateJobPosting } = require('../services/claudeService');
const db = require('../db');
const { trackEvent } = require('../services/events');

// Maps Zod validation issues to user-readable messages
function zodErrorToMessage(issues, lang) {
  for (const issue of issues) {
    const path = issue.path[0];
    if (path === 'bullets') {
      if (issue.code === 'too_big') {
        return lang === 'en'
          ? 'Max 10 bullets — remove some to continue'
          : 'Maks 10 bullets — fjern nogle for at fortsætte';
      }
      if (issue.code === 'too_small') {
        return lang === 'en'
          ? 'At least one bullet is required'
          : 'Mindst én bullet er påkrævet';
      }
    }
    if (path === 'job_title') {
      return lang === 'en' ? 'Job title is required' : 'Jobtitel er påkrævet';
    }
    if (path === 'language') {
      return lang === 'en' ? 'Invalid language selection' : 'Ugyldigt sprogvalg';
    }
  }
  return lang === 'en'
    ? 'Invalid form data — check all fields'
    : 'Ugyldig formular-data — kontrollér alle felter';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.docx')) cb(null, true);
    else cb(new Error('Only .docx templates are accepted'));
  },
});

const tier1Schema = z.object({
  project_id: z.string().uuid(),
  job_title: z.string().min(1).max(200),
  bullets: z.array(z.string().min(1).max(500)).min(1).max(20),
  language: z.enum(['da', 'en']),
  location: z.string().max(100).optional().default(''),
  start_date: z.string().max(50).optional().default(''),
  employment_type: z.string().max(50).optional().default(''),
});

router.use(requireAuth);

// GET /api/generate/tier1/:projectId — load existing outputs for returning users
router.get('/tier1/:projectId', async (req, res, next) => {
  try {
    const { rows: member } = await db.query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [req.params.projectId, req.user.id]
    );
    if (!member.length) return res.status(404).json({ error: 'Not found' });

    const [{ rows: inputs }, { rows: outputs }, { rows: selection }] = await Promise.all([
      db.query(
        `SELECT input_data FROM project_inputs WHERE project_id = $1 AND step_number = 2`,
        [req.params.projectId]
      ),
      db.query(
        `SELECT variant, content, language, generation_batch, generated_at
         FROM project_outputs
         WHERE project_id = $1 AND output_type = 'jobopslag'
         ORDER BY generated_at DESC`,
        [req.params.projectId]
      ),
      db.query(
        `SELECT input_data FROM project_inputs WHERE project_id = $1 AND step_number = 4`,
        [req.params.projectId]
      ),
    ]);

    // Group outputs into generation batches (newest first)
    const batchMap = new Map();
    for (const row of outputs) {
      // Use batch UUID if available, otherwise fall back to second-level timestamp grouping
      const key = row.generation_batch || row.generated_at.toISOString().slice(0, 19);
      if (!batchMap.has(key)) {
        batchMap.set(key, { generated_at: row.generated_at, variant_a: null, variant_b: null });
      }
      const batch = batchMap.get(key);
      if (row.variant === 'A') batch.variant_a = row.content;
      if (row.variant === 'B') batch.variant_b = row.content;
    }

    const batches = [...batchMap.values()].filter((b) => b.variant_a || b.variant_b);
    const latest = batches[0];
    const previous = batches.slice(1);

    res.json({
      inputs: inputs[0]?.input_data ?? null,
      variant_a: latest?.variant_a ?? null,
      variant_b: latest?.variant_b ?? null,
      previous_variants: previous,
      selection: selection[0]?.input_data ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// Multer error handler (file too large / wrong type)
function multerErrorHandler(err, req, res, next) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    const lang = ['da', 'en'].includes(req.body?.language) ? req.body.language : 'da';
    return res.status(400).json({
      error: lang === 'en'
        ? 'Template file too large — max 5 MB'
        : 'Template-filen er for stor — maks 5 MB',
    });
  }
  if (err?.message === 'Only .docx templates are accepted') {
    const lang = ['da', 'en'].includes(req.body?.language) ? req.body.language : 'da';
    return res.status(400).json({
      error: lang === 'en'
        ? 'Only .docx files are accepted as templates'
        : 'Kun .docx-filer accepteres som skabelon',
    });
  }
  next(err);
}

// POST /api/generate/tier1 — run bias check + generate 2 variants
router.post('/tier1', aiLimiter, upload.single('template'), multerErrorHandler, async (req, res, next) => {
  // ── Payment gate (Fase 7 — Stripe). Superadmin always bypasses. ──────────────
  const isSuperAdmin = req.user.role === 'superadmin';
  // TODO Fase 7: if (!isSuperAdmin) { check subscription tier / credits here }
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const body = { ...req.body };
    if (typeof body.bullets === 'string') {
      try { body.bullets = JSON.parse(body.bullets); } catch { body.bullets = [body.bullets]; }
    }

    const parsed = tier1Schema.safeParse(body);
    if (!parsed.success) {
      const lang = ['da', 'en'].includes(body.language) ? body.language : 'da';
      return res.status(400).json({
        error: zodErrorToMessage(parsed.error.issues, lang),
      });
    }
    const { project_id, job_title, bullets, language, location, start_date, employment_type } = parsed.data;

    const { rows: member } = await db.query(
      `SELECT 1 FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1 AND pm.user_id = $2 AND p.deleted_at IS NULL`,
      [project_id, req.user.id]
    );
    if (!member.length) return res.status(404).json({ error: 'Project not found' });

    // Extract template text and HTML if uploaded
    let templateContent = null;
    let templateHtml = null;
    if (req.file) {
      try {
        const [rawResult, htmlResult] = await Promise.all([
          mammoth.extractRawText({ buffer: req.file.buffer }),
          mammoth.convertToHtml({ buffer: req.file.buffer }),
        ]);
        templateContent = rawResult.value.slice(0, 2000);
        templateHtml = htmlResult.value.slice(0, 12000);
      } catch { /* ignore parse errors */ }
    }

    // Tier A+B bias check on inputs
    const inputText = `${job_title}\n${bullets.join('\n')}`;
    const inputWarnings = await runBiasCheck(inputText, language, project_id, req.user.id, 2);

    // Save inputs
    await db.query(
      `INSERT INTO project_inputs (project_id, step_number, input_data, updated_at)
       VALUES ($1, 2, $2, NOW())
       ON CONFLICT (project_id, step_number)
       DO UPDATE SET input_data = $2, updated_at = NOW()`,
      [project_id, JSON.stringify({ job_title, bullets, language, location, start_date, employment_type, has_template: !!templateContent })]
    );

    // Sync project language
    await db.query(
      `UPDATE projects SET output_language = $1, updated_at = NOW() WHERE id = $2`,
      [language, project_id]
    );

    // Generate with Claude
    const { variant_a, variant_b } = await generateJobPosting({
      jobTitle: job_title, bullets, language, templateContent, templateHtml,
      location, startDate: start_date, employmentType: employment_type,
      projectId: project_id, userId: req.user.id,
    });

    // Tier C format checks on generated variants
    const tierCWarningsA = checkTierC(variant_a, language).map((w) => ({ ...w, source: 'variant_a' }));
    const tierCWarningsB = checkTierC(variant_b, language).map((w) => ({ ...w, source: 'variant_b' }));

    // Persist outputs — keep history, each generation gets a shared batch ID
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
      `UPDATE projects SET completion_step = 3, updated_at = NOW() WHERE id = $1`,
      [project_id]
    );
    await trackEvent('step_completed', req.user.id, { project_id, step: 2, tier: 1 });

    res.json({
      bias_warnings: [
        ...inputWarnings,
        ...tierCWarningsA,
        ...tierCWarningsB,
      ],
      variant_a,
      variant_b,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/generate/tier1/save-selection — record which variant was chosen
router.post('/tier1/save-selection', async (req, res, next) => {
  try {
    const { project_id, selected_variant, final_content } = req.body;
    if (!project_id || !['A', 'B', 'mix'].includes(selected_variant)) {
      return res.status(400).json({ error: 'Invalid selection' });
    }

    const { rows } = await db.query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [project_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    await db.query(
      `INSERT INTO project_inputs (project_id, step_number, input_data, updated_at)
       VALUES ($1, 4, $2, NOW())
       ON CONFLICT (project_id, step_number)
       DO UPDATE SET input_data = $2, updated_at = NOW()`,
      [project_id, JSON.stringify({ selected_variant, final_content })]
    );
    await db.query(
      `UPDATE projects SET completion_step = 4, updated_at = NOW() WHERE id = $1`,
      [project_id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
