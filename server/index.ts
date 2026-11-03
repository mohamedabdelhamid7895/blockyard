/* Blockyard server: API, Claude features, MCP connector, published sites and the designer app. */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './env';
import { initDb } from './db';
import { HttpError } from './http';
import { auth } from './routes/auth';
import { orgs, invites } from './routes/orgs';
import { projects } from './routes/projects';
import { ai } from './ai';
import { mcpHandler } from './mcp';
import { sitesByHost, sitesByPath } from './sites';

await initDb();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Published sites on their own hosts come first, before the app and API.
app.use(sitesByHost);

app.use('/api', cors({ origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin) || !env.isProd) }));
app.use('/api', express.json({ limit: '25mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, version: 2 }));
app.use('/api/auth', auth);
app.use('/api/orgs', orgs);
app.use('/api/invites', invites);
app.use('/api/projects', projects);
app.use('/api/ai', ai);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

app.all('/mcp', cors(), express.json({ limit: '25mb' }), mcpHandler);
app.use('/sites', sitesByPath);

// The designer (built by Vite) in production.
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
  app.get('/{*any}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return; }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: 'That is too large to save. Large uploaded images are the usual cause; use image URLs instead.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
});

app.listen(env.port, () => console.log(`Blockyard server on ${env.publicUrl} (port ${env.port})`));
