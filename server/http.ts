/* HTTP helpers: errors, authentication and permission checks. */
import type { NextFunction, Request, Response } from 'express';
import { one, q } from './db';
import { hashToken } from './security';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string): never => { throw new HttpError(status, message); };

export interface AuthUser { id: string; email: string; name: string }
export type OrgRole = 'owner' | 'admin' | 'member';
declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

/** Resolves a bearer token (session or personal access token) to a user. */
export async function userFromToken(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const row = await one(
    `select u.id, u.email, u.name, t.id as token_id from tokens t join users u on u.id = t.user_id
     where t.token_hash = $1 and (t.expires_at is null or t.expires_at > now())`,
    [hashToken(token)],
  );
  if (!row) return null;
  q('update tokens set last_used_at = now() where id = $1', [row.token_id]).catch(() => {});
  return { id: row.id, email: row.email, name: row.name };
}

export const bearer = (req: Request) => req.headers.authorization?.replace(/^Bearer\s+/i, '') || undefined;

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await userFromToken(bearer(req));
  if (!user) return next(new HttpError(401, 'Please sign in'));
  req.user = user;
  next();
}

const RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 };

export async function orgRole(userId: string, orgId: string): Promise<OrgRole | null> {
  const row = await one('select role from org_members where org_id = $1 and user_id = $2', [orgId, userId]);
  return (row?.role as OrgRole) || null;
}

/** Throws unless the user has at least `min` role in the org. Returns their role. */
export async function needOrgRole(userId: string, orgId: string, min: OrgRole = 'member') {
  const role = await orgRole(userId, orgId);
  if (!role) fail(404, 'Workspace not found');
  if (RANK[role!] < RANK[min]) fail(403, `You need to be ${min === 'owner' ? 'an owner' : 'an admin'} of this workspace`);
  return role!;
}

/**
 * Loads a project the user can open. Owners and admins see every project in the org; members see
 * projects with no team and projects in teams they belong to.
 */
export async function needProject(userId: string, projectId: string, minOrgRole: OrgRole = 'member') {
  const p = await one('select * from projects where id = $1', [projectId]);
  if (!p) fail(404, 'Project not found');
  const role = await orgRole(userId, p!.org_id);
  if (!role) fail(404, 'Project not found');
  if (role === 'member' && p!.team_id) {
    const inTeam = await one('select 1 from team_members where team_id = $1 and user_id = $2', [p!.team_id, userId]);
    if (!inTeam) fail(404, 'Project not found');
  }
  if (RANK[role!] < RANK[minOrgRole]) fail(403, 'You need to be a workspace admin to do that');
  return { project: p!, role: role! };
}

/** Very small fixed-window rate limiter, per key. Good enough for one instance; use a shared store when scaling out. */
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return; }
  if (++h.n > limit) fail(429, 'Too many attempts. Try again in a minute.');
}
