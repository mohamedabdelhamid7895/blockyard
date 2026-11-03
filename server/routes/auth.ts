/* Sign up, sign in, the current user, and personal access tokens (for connecting Claude). */
import { Router } from 'express';
import { z } from 'zod';
import { one, q } from '../db';
import { fail, rateLimit, requireAuth, bearer } from '../http';
import { hashPassword, hashToken, newId, newToken, verifyPassword } from '../security';

export const auth = Router();

const SESSION_DAYS = 30;

async function createSession(userId: string) {
  const { token, hash } = newToken('bys_');
  await q(`insert into tokens (id, token_hash, user_id, kind, expires_at) values ($1, $2, $3, 'session', now() + interval '${SESSION_DAYS} days')`,
    [newId(), hash, userId]);
  return token;
}

/** Joins every workspace that invited this email. */
async function acceptInvitesFor(userId: string, email: string) {
  const invites = await q('select * from invites where lower(email) = lower($1)', [email]);
  for (const inv of invites) {
    await q('insert into org_members (org_id, user_id, role) values ($1, $2, $3) on conflict do nothing', [inv.org_id, userId, inv.role]);
    await q('delete from invites where id = $1', [inv.id]);
  }
}

const Signup = z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(200) });

auth.post('/signup', async (req, res) => {
  rateLimit(`signup:${req.ip}`, 10, 60_000);
  const body = Signup.safeParse(req.body);
  if (!body.success) fail(400, 'Enter your name, a valid email and a password of at least 8 characters');
  const { name, email, password } = body.data!;
  if (await one('select 1 from users where email = $1', [email])) fail(409, 'An account with this email already exists');
  const userId = newId(), orgId = newId();
  await q('insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)', [userId, email, name, hashPassword(password)]);
  await q('insert into orgs (id, name, personal) values ($1, $2, true)', [orgId, `${name.split(' ')[0]}'s workspace`]);
  await q(`insert into org_members (org_id, user_id, role) values ($1, $2, 'owner')`, [orgId, userId]);
  await acceptInvitesFor(userId, email);
  res.json({ token: await createSession(userId) });
});

auth.post('/login', async (req, res) => {
  rateLimit(`login:${req.ip}`, 20, 60_000);
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = await one('select * from users where email = $1', [email]);
  if (!user || !verifyPassword(String(req.body?.password || ''), user.password_hash)) fail(401, 'Wrong email or password');
  await acceptInvitesFor(user.id, email);
  res.json({ token: await createSession(user.id) });
});

auth.post('/logout', requireAuth, async (req, res) => {
  await q(`delete from tokens where token_hash = $1 and kind = 'session'`, [hashToken(bearer(req)!)]);
  res.json({ ok: true });
});

auth.get('/me', requireAuth, async (req, res) => {
  const orgs = await q(
    `select o.id, o.name, o.personal, m.role from org_members m join orgs o on o.id = m.org_id
     where m.user_id = $1 order by (o.personal and m.role = 'owner') desc, o.created_at`, [req.user!.id]);
  res.json({ user: req.user, orgs });
});

auth.patch('/me', requireAuth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (name) await q('update users set name = $1 where id = $2', [name.slice(0, 80), req.user!.id]);
  if (req.body?.newPassword) {
    const u = await one('select password_hash from users where id = $1', [req.user!.id]);
    if (!verifyPassword(String(req.body.currentPassword || ''), u!.password_hash)) fail(400, 'Your current password is wrong');
    if (String(req.body.newPassword).length < 8) fail(400, 'Use at least 8 characters');
    await q('update users set password_hash = $1 where id = $2', [hashPassword(req.body.newPassword), req.user!.id]);
  }
  res.json({ ok: true });
});

/* ---- Personal access tokens ---- */
auth.get('/tokens', requireAuth, async (req, res) => {
  res.json(await q(`select id, name, created_at, last_used_at from tokens where user_id = $1 and kind = 'pat' order by created_at desc`, [req.user!.id]));
});

auth.post('/tokens', requireAuth, async (req, res) => {
  const name = String(req.body?.name || 'Claude').trim().slice(0, 60) || 'Claude';
  const { token, hash } = newToken('byk_');
  await q(`insert into tokens (id, token_hash, user_id, kind, name) values ($1, $2, $3, 'pat', $4)`, [newId(), hash, req.user!.id, name]);
  res.json({ token, name });
});

auth.delete('/tokens/:id', requireAuth, async (req, res) => {
  await q(`delete from tokens where id = $1 and user_id = $2 and kind = 'pat'`, [req.params.id, req.user!.id]);
  res.json({ ok: true });
});
