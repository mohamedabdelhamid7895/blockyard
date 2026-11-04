/* Outbound requests to user-supplied URLs (automations, site import) must not reach private networks. */
import dns from 'node:dns/promises';
import net from 'node:net';
import { fail } from './http';

function privateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:') && privateIp(v.slice(7));
}

/** Throws unless the URL is http(s) and resolves only to public addresses. */
export async function assertPublicUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { fail(400, `“${raw}” is not a valid URL`); }
  if (url!.protocol !== 'http:' && url!.protocol !== 'https:') fail(400, 'Only http and https URLs are allowed');
  if (process.env.ALLOW_PRIVATE_URLS === '1') return url!;
  const host = url!.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addrs.length) fail(400, `Couldn't resolve ${host}`);
  if (addrs.some(privateIp)) fail(400, `${host} points to a private network address, which isn't allowed`);
  return url!;
}

/** fetch() for user-supplied URLs: checks the address, follows up to 5 redirects (each checked), and times out. */
export async function safeFetch(raw: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  let current = raw;
  for (let i = 0; i < 6; i++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current).toString();
      if (init.method && init.method !== 'GET') init = { ...init, method: 'GET', body: undefined };
      continue;
    }
    return res;
  }
  fail(400, 'Too many redirects');
  throw new Error('unreachable');
}
