const express = require('express');
const router = express.Router();
const { z } = require('zod');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { trackEvent } = require('../services/events');

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  tier: z.number().int().min(1).max(2),
  output_language: z.enum(['da', 'en']).default('da'),
});

// All project routes require auth
router.use(requireAuth);

// GET /api/projects — list user's projects
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.tier, p.status, p.output_language,
              p.completion_step, p.created_at, p.updated_at, p.completed_at
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = $1
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects — create project
router.post('/', async (req, res, next) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid project data', details: parsed.error.issues });
    }
    const { name, tier, output_language } = parsed.data;

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO projects (owner_id, name, tier, output_language)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, tier, status, output_language, completion_step, created_at`,
        [req.user.id, name, tier, output_language]
      );
      const project = rows[0];

      // Create owner membership
      await client.query(
        `INSERT INTO project_members (project_id, user_id, role, accepted_at)
         VALUES ($1, $2, 'owner', NOW())`,
        [project.id, req.user.id]
      );

      await client.query('COMMIT');

      await trackEvent('project_started', req.user.id, { project_id: project.id, tier });
      res.status(201).json(project);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id — get single project (enforces membership)
router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.name, p.tier, p.status, p.output_language,
              p.jurisdiction, p.completion_step, p.created_at, p.updated_at, p.completed_at
       FROM projects p
       JOIN project_members pm ON pm.project_id = p.id
       WHERE p.id = $1 AND pm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id — update status/step
router.patch('/:id', async (req, res, next) => {
  try {
    const { rows: memberRows } = await db.query(
      `SELECT pm.role FROM project_members pm
       WHERE pm.project_id = $1 AND pm.user_id = $2`,
      [req.params.id, req.user.id]
    );
    if (memberRows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const allowed = ['status', 'name', 'completion_step'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    const values = [req.params.id, ...Object.values(updates)];
    const { rows } = await db.query(
      `UPDATE projects SET ${setClauses}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );

    if (updates.status === 'completed') {
      await trackEvent('project_downloaded', req.user.id, { project_id: req.params.id });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id — owner or superadmin can delete
router.delete('/:id', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user.role === 'superadmin';

    const { rows } = await db.query(
      `DELETE FROM projects
       WHERE id = $1 AND ($2 OR owner_id = $3)
       RETURNING id`,
      [req.params.id, isSuperAdmin, req.user.id]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
