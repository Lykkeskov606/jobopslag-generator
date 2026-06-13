const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { trackEvent } = require('../services/events');
const { buildDocxBuffer } = require('../utils/docxBuilder');

router.use(requireAuth);

router.post('/docx', async (req, res, next) => {
  // ── Payment gate (Fase 7 — Stripe). Superadmin always bypasses. ──────────────
  const isSuperAdmin = req.user.role === 'superadmin';
  // TODO Fase 7: if (!isSuperAdmin) { check subscription tier / credits here }
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    const { project_id, content, job_title, language } = req.body;
    if (!project_id || !content) {
      return res.status(400).json({ error: 'project_id and content are required' });
    }

    const { rows } = await db.query(
      `SELECT p.id, p.name FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1 AND pm.user_id = $2`,
      [project_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Project not found' });

    const title = (job_title || rows[0].name).trim();
    const buffer = await buildDocxBuffer(title, content);
    const safeTitle = title.replace(/[^\w\sæøåÆØÅ-]/g, '').replace(/\s+/g, '-');
    const filename = `${safeTitle}.docx`;

    await db.query(
      `UPDATE projects
       SET status = 'completed', completion_step = 5, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [project_id]
    );
    await trackEvent('project_downloaded', req.user.id, { project_id, language });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
