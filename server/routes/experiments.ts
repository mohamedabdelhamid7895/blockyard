/* A/B tests: the public tracking beacon, results with statistical confidence, and picking a winner. */
import express, { Router } from 'express';
import cors from 'cors';
import { one, q } from '../db';
import { fail, needProject, rateLimit, requireAuth } from '../http';
import type { Project } from '../../src/types';

export const abPublic = Router();
abPublic.use(cors());
abPublic.use(express.json({ type: () => true, limit: '4kb' }));
abPublic.post('/:projectId', async (req, res) => {
  rateLimit(`ab:${req.ip}`, 120, 60_000);
  const { experiment, variant, kind, visitor } = req.body || {};
  if (typeof experiment !== 'string' || !['a', 'b'].includes(variant) || !['view', 'convert'].includes(kind) || typeof visitor !== 'string') {
    res.status(400).end(); return;
  }
  await q(`insert into ab_events (experiment_id, project_id, variant, kind, visitor) select $1, id, $2, $3, $4 from projects where id = $5
           on conflict do nothing`, [experiment.slice(0, 60), variant, kind, visitor.slice(0, 80), req.params.projectId]).catch(() => {});
  res.status(204).end();
});

/** Standard normal CDF. */
function phi(z: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

/** Two-proportion z-test: how confident we are that B's conversion rate differs from A's. */
export function significance(a: { views: number; conversions: number }, b: { views: number; conversions: number }) {
  if (!a.views || !b.views) return { uplift: null as number | null, confidence: 0 };
  const p1 = a.conversions / a.views, p2 = b.conversions / b.views;
  const pool = (a.conversions + b.conversions) / (a.views + b.views);
  const se = Math.sqrt(pool * (1 - pool) * (1 / a.views + 1 / b.views));
  const z = se ? (p2 - p1) / se : 0;
  return { uplift: p1 ? (p2 - p1) / p1 : null, confidence: se ? 1 - 2 * (1 - phi(Math.abs(z))) : 0 };
}

export const experiments = Router();
experiments.use(requireAuth);

experiments.get('/:id/experiments', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const data = project.data as Project;
  const tests = data.pages.filter((pg) => pg.abTest).map((pg) => ({ page: pg, test: pg.abTest! }));
  const counts = await q(
    `select experiment_id, variant, kind, count(*)::int as n from ab_events where project_id = $1 group by experiment_id, variant, kind`, [project.id]);
  const n = (exp: string, v: string, k: string) => counts.find((c) => c.experiment_id === exp && c.variant === v && c.kind === k)?.n || 0;
  res.json(tests.map(({ page, test }) => {
    const a = { views: n(test.id, 'a', 'view'), conversions: n(test.id, 'a', 'convert') };
    const b = { views: n(test.id, 'b', 'view'), conversions: n(test.id, 'b', 'convert') };
    return { id: test.id, pageId: page.id, pageName: page.name, slug: page.slug, status: test.status, split: test.split, goal: test.goal,
      startedAt: test.startedAt, a, b, ...significance(a, b) };
  }));
});

/** Ends a test. With winner "b" the variant's content replaces the original page. */
experiments.post('/:id/experiments/:expId/finish', async (req, res) => {
  const { project } = await needProject(req.user!.id, req.params.id);
  const data = project.data as Project;
  const page = data.pages.find((pg) => pg.abTest?.id === req.params.expId);
  if (!page) fail(404, 'Test not found');
  const variant = data.pages.find((pg) => pg.id === page!.abTest!.variantPageId);
  if (req.body?.winner === 'b' && variant) {
    page!.root = variant.root;
    if (variant.title) page!.title = variant.title;
  }
  delete page!.abTest;
  data.pages = data.pages.filter((pg) => pg.variantOf !== page!.id);
  const row = await one('update projects set data = $1, version = version + 1, updated_at = now() where id = $2 returning version', [JSON.stringify(data), project.id]);
  res.json({ version: row!.version });
});
