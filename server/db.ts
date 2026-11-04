/* Database access. Postgres via `pg` when DATABASE_URL is set, otherwise embedded PGlite (also Postgres). */
import path from 'node:path';
import fs from 'node:fs';
import { DATA_DIR, env } from './env';

type Row = Record<string, any>;
interface Driver {
  query(sql: string, params?: unknown[]): Promise<Row[]>;
}

let driver: Driver;

const SCHEMA = `
create table if not exists users (
  id text primary key,
  email text not null unique,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists tokens (
  id text primary key,
  token_hash text not null unique,
  user_id text not null references users(id) on delete cascade,
  kind text not null,              -- 'session' | 'pat'
  name text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);
create table if not exists orgs (
  id text primary key,
  name text not null,
  personal boolean not null default false,
  ai_key_enc text,
  ai_model text not null default 'claude-opus-5-5',
  created_at timestamptz not null default now()
);
create table if not exists org_members (
  org_id text not null references orgs(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null,              -- 'owner' | 'admin' | 'member'
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create table if not exists teams (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create table if not exists team_members (
  team_id text not null references teams(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  primary key (team_id, user_id)
);
create table if not exists invites (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  invited_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists projects (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  team_id text references teams(id) on delete set null,
  name text not null,
  slug text not null unique,
  data jsonb not null,
  version integer not null default 1,
  live_deployment_id text,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_org on projects(org_id);
create table if not exists deployments (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  files jsonb not null,
  file_count integer not null,
  size_bytes integer not null,
  note text not null default '',
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists deployments_project on deployments(project_id, created_at desc);
create table if not exists domains (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  hostname text not null unique,
  verify_token text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table orgs add column if not exists ai_config jsonb not null default '{}'::jsonb;
alter table orgs add column if not exists smtp_enc text;
alter table deployments add column if not exists meta jsonb not null default '{}'::jsonb;
create table if not exists form_submissions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  form text not null,
  page text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists form_submissions_project on form_submissions(project_id, created_at desc);
create table if not exists assets (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  project_id text references projects(id) on delete cascade,
  name text not null,
  mime text not null,
  size integer not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
create table if not exists workflows (
  id text primary key,
  org_id text not null references orgs(id) on delete cascade,
  name text not null,
  enabled boolean not null default false,
  trigger jsonb not null,
  steps jsonb not null default '[]'::jsonb,
  hook_token text not null,
  next_run_at timestamptz,
  created_by text references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_org on workflows(org_id);
create table if not exists workflow_runs (
  id text primary key,
  workflow_id text not null references workflows(id) on delete cascade,
  status text not null,
  trigger_data jsonb not null,
  log jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists workflow_runs_wf on workflow_runs(workflow_id, started_at desc);
create table if not exists ab_events (
  experiment_id text not null,
  project_id text not null references projects(id) on delete cascade,
  variant text not null,
  kind text not null,
  visitor text not null,
  created_at timestamptz not null default now(),
  primary key (experiment_id, visitor, kind)
);
`;

export async function initDb() {
  if (env.databaseUrl) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: env.databaseUrl,
      ssl: /sslmode=require|neon\.tech|supabase/.test(env.databaseUrl) ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.DB_POOL_SIZE || 10),
    });
    driver = { query: async (sql, params) => (await pool.query(sql, params as unknown[])).rows };
    console.log('Database: PostgreSQL');
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const dir = path.join(DATA_DIR, 'pglite');
    fs.mkdirSync(dir, { recursive: true });
    const db = new PGlite(dir);
    driver = { query: async (sql, params) => (await db.query<Row>(sql, params as unknown[])).rows };
    console.log(`Database: embedded PGlite in ${dir}`);
  }
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await driver.query(stmt);
}

export const q = (sql: string, params: unknown[] = []) => driver.query(sql, params);
export const one = async (sql: string, params: unknown[] = []) => (await driver.query(sql, params))[0] || null;
