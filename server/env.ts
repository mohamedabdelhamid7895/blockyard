/* Server configuration from environment variables. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || '.data');

/** Secret for encrypting stored API keys. Required in production; generated and kept in DATA_DIR locally. */
function appSecret() {
  if (process.env.APP_SECRET) return process.env.APP_SECRET;
  if (isProd) throw new Error('APP_SECRET must be set in production');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, 'secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(file, 'utf8').trim();
}

export const env = {
  isProd,
  port: Number(process.env.PORT || 8787),
  /** Postgres connection string. Without it, an embedded PGlite database in DATA_DIR is used. */
  databaseUrl: process.env.DATABASE_URL || '',
  appSecret: appSecret(),
  /** Public URL of this server, used in links (e.g. https://blockyard.onrender.com). */
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, ''),
  /** Wildcard domain for published sites: <site>.SITES_DOMAIN. Optional. */
  sitesDomain: (process.env.SITES_DOMAIN || '').toLowerCase(),
  /** Hostname custom domains should point at with a CNAME record. */
  cnameTarget: (process.env.CNAME_TARGET || '').toLowerCase(),
  /** Extra origins allowed to call the API (e.g. the GitHub Pages editor). Comma-separated. */
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  /** Skips DNS checks for custom domains. For local development only. */
  skipDomainVerification: process.env.SKIP_DOMAIN_VERIFICATION === '1' || !isProd,
};
