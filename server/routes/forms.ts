/* Blockyard Forms: public submission endpoint for published sites, and the submissions API. */
import express, { Router } from 'express';
import cors from 'cors';
import { one, q } from '../db';
import { fail, needProject, rateLimit, requireAuth } from '../http';
import { newId } from '../security';
import { fireEvent } from '../workflows';

/** Public: published sites post here (from any domain). */
export const formsPublic = Router();
formsPublic.use(cors());
formsPublic.use(express.json({ limit: '200kb' }));
formsPublic.use(express.urlencoded({ extended: false, limit: '200kb' }));

formsPublic.post('/:projectId', async (req, res) => {
  rateLimit(`form:${req.ip}:${req.params.projectId}`, 20, 60_000);
  const project = await one('select id, org_id, name from projects where id = $1', [req.params.projectId]);
  if (!project) fail(404, 'Unknown site');
  const json = req.is('application/json');
  const raw = (json ? req.body?.fields : req.body) || {};
  if (raw._gotcha) { res.json({ ok: true }); return; } // honeypot: pretend success for bots
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw).slice(0, 50)) {
    if (k === '_gotcha') continue;
    fields[String(k).slice(0, 100)] = String(v ?? '').slice(0, 5000);
  }
  if (!Object.keys(fields).length) fail(400, 'The form was empty');
  const form = String((json ? req.body?.form : raw._form) || 'Form').slice(0, 100);
  const page = String((json ? req.body?.page : req.get('referer')) || '').slice(0, 300);
  const id = newId();
  await q('insert into form_submissions (id, project_id, form, page, data) values ($1, $2, $3, $4, $5)', [id, project!.id, form, page, JSON.stringify(fields)]);
  fireEvent(project!.org_id, 'form_submission', { projectId: project!.id, site: project!.name, form, page, fields, submittedAt: new Date().toISOString() });
  if (json) res.json({ ok: true });
  else res.type('html').send('<!doctype html><meta charset="utf-8"><title>Thank you</title><body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh"><div><h1>Thank you!</h1><p>Your submission has been received.</p><p><a href="javascript:history.back()">Go back</a></p></div></body>');
});

/** Signed-in: read, export and delete submissions. */
export const submissions = Router();
submissions.use(requireAuth);

submissions.get('/:id/submissions', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const rows = await q('select id, form, page, data, created_at from form_submissions where project_id = $1 order by created_at desc limit 500', [project.id]);
  const forms = await q('select form, count(*)::int as n from form_submissions where project_id = $1 group by form order by form', [project.id]);
  res.json({ submissions: rows, forms });
});

submissions.get('/:id/submissions.csv', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const rows = await q('select form, page, data, created_at from form_submissions where project_id = $1 order by created_at desc', [project.id]);
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.data)))];
  const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [['Submitted', 'Form', 'Page', ...keys].map(cell).join(','),
    ...rows.map((r) => [new Date(r.created_at).toISOString(), r.form, r.page, ...keys.map((k) => r.data[k])].map(cell).join(','))].join('\n');
  res.setHeader('Content-Disposition', `attachment; filename="${project.slug}-submissions.csv"`);
  res.type('text/csv').send(csv);
});

submissions.delete('/:id/submissions/:sid', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  await q('delete from form_submissions where id = $1 and project_id = $2', [req.params.sid, project.id]);
  res.json({ ok: true });
});
