const express = require('express');
const router = express.Router();
const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } = require('docx');
const { requireAuth } = require('../middleware/auth');
const db = require('../db');
const { trackEvent } = require('../services/events');

router.use(requireAuth);

function buildParagraphs(content) {
  return content.split('\n').map((line) => {
    const trimmed = line.trim();

    if (!trimmed) {
      return new Paragraph({ spacing: { after: 100 } });
    }

    // Section heading: short line ending with ':'
    if (trimmed.endsWith(':') && trimmed.length < 70 && !trimmed.includes('. ')) {
      return new Paragraph({
        children: [new TextRun({ text: trimmed, bold: true, size: 24 })],
        spacing: { before: 280, after: 80 },
      });
    }

    // Bullet line
    if (/^[•\-\*]\s/.test(trimmed)) {
      return new Paragraph({
        bullet: { level: 0 },
        children: [new TextRun(trimmed.replace(/^[•\-\*]\s*/, ''))],
        spacing: { after: 80 },
      });
    }

    return new Paragraph({
      children: [new TextRun(trimmed)],
      spacing: { after: 120 },
    });
  });
}

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
    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 36 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 480 },
          }),
          ...buildParagraphs(content),
        ],
      }],
    });

    const buffer = await Packer.toBuffer(doc);
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
