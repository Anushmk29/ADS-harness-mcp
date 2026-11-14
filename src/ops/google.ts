// One-time Google sign-in (desktop OAuth + PKCE) and read-only checks for GA4 + Search Console.
import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

type Fetch = typeof fetch;
export const SCOPES = {
  analytics: 'https://www.googleapis.com/auth/analytics.readonly',
  searchConsole: 'https://www.googleapis.com/auth/webmasters.readonly',
  ads: 'https://www.googleapis.com/auth/adwords'
} as const;

export interface GoogleClient { clientId: string; clientSecret: string }

/** Client from the downloaded JSON ({"installed": {...}} or {"web": {...}}), else GOOGLE_CLIENT_ID/SECRET. */
export function loadGoogleClient(jsonPath?: string, env: NodeJS.ProcessEnv = process.env): GoogleClient {
  if (jsonPath) {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
    const c = raw.installed ?? raw.web;
    if (!c?.client_id || !c?.client_secret) throw new Error(`${jsonPath} is not a Google OAuth client file (needs installed.client_id and client_secret)`);
    return { clientId: c.client_id, clientSecret: c.client_secret };
  }
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Pass --client <downloaded client JSON> or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export function pkce() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), state: randomBytes(16).toString('hex') };
}

/** offline + prompt=consent: Google only returns a refresh token on a fresh consent. */
export function authUrl(client: GoogleClient, redirectUri: string, scopes: string[], p: { challenge: string; state: string }): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.search = new URLSearchParams({
    client_id: client.clientId, redirect_uri: redirectUri, response_type: 'code', scope: scopes.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
    code_challenge: p.challenge, code_challenge_method: 'S256', state: p.state
  }).toString();
  return u.toString();
}

/** Pull the code out of a redirect URL (pasted by hand when the browser ran on another machine). */
export function codeFromRedirect(redirect: string, state: string): string {
  const u = new URL(redirect.trim());
  if (u.searchParams.get('error')) throw new Error(`Google refused: ${u.searchParams.get('error')}`);
  if (u.searchParams.get('state') !== state) throw new Error('This sign-in link is from a different attempt; start google-auth again');
  const code = u.searchParams.get('code');
  if (!code) throw new Error('No ?code= in that URL');
  return code;
}

export async function exchangeCode(client: GoogleClient, code: string, redirectUri: string, verifier: string, f: Fetch = fetch) {
  const res = await f('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(30_000), body: new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: client.clientId, client_secret: client.clientSecret, code_verifier: verifier }) });
  const body = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${body.error_description ?? body.error ?? 'unknown'}`);
  if (!body.refresh_token) throw new Error('Google returned no refresh token. Remove the app at https://myaccount.google.com/permissions and run google-auth again.');
  return { refreshToken: body.refresh_token as string, accessToken: body.access_token as string, scope: String(body.scope ?? '') };
}

export async function accessToken(client: GoogleClient, refreshToken: string, f: Fetch = fetch): Promise<string> {
  const res = await f('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(30_000),
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client.clientId, client_secret: client.clientSecret }) });
  const body = await res.json().catch(() => ({})) as any;
  if (!res.ok || !body.access_token) throw new Error(`Refresh failed (${res.status}: ${body.error ?? 'unknown'}). If this happens after ~7 days, the OAuth app is still in "Testing"; publish it, then run google-auth again.`);
  return body.access_token;
}

/**
 * Opens a loopback listener and waits for Google's redirect, or for the redirect URL pasted on stdin
 * (when the account owner approves on another machine and their browser shows "can't connect to localhost").
 */
export async function signIn(client: GoogleClient, scopes: string[], io: { open?: (url: string) => void; log: (s: string) => void; paste?: () => Promise<string> }, f: Fetch = fetch) {
  const p = pkce();
  const server = http.createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const redirectUri = `http://localhost:${(server.address() as any).port}`;
  const url = authUrl(client, redirectUri, scopes, p);
  io.log(`\nOpen this link and sign in with the Google account that can see the client's Analytics / Search Console:\n\n${url}\n`);
  io.log('If the browser ends on a "can\'t reach localhost" page (e.g. you approved on another computer), copy that page\'s full address and paste it here.\n');
  io.open?.(url);
  try {
    const code = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out after 10 minutes; run google-auth again')), 10 * 60_000);
      server.on('request', (req, res) => {
        try {
          const got = codeFromRedirect(`${redirectUri}${req.url}`, p.state);
          res.writeHead(200, { 'Content-Type': 'text/html' }).end('<h2>Done. You can close this tab and go back to the terminal.</h2>');
          clearTimeout(timer); resolve(got);
        } catch (e: any) { res.writeHead(400, { 'Content-Type': 'text/plain' }).end(e.message); }
      });
      io.paste?.().then(pasted => { clearTimeout(timer); resolve(codeFromRedirect(pasted, p.state)); }).catch(() => { /* stdin closed: keep waiting for the browser */ });
    });
    return await exchangeCode(client, code, redirectUri, p.verifier, f);
  } finally { server.close(); }
}

// ---- read-only checks (Step 9 of the marketing checklist) ----
const get = async (url: string, token: string, f: Fetch, init: RequestInit = {}) => {
  const res = await f(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers as any) }, signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => ({})) as any;
  if (!res.ok) throw new Error(`${res.status} ${body.error?.message ?? ''}`.trim());
  return body;
};

export async function ga4Properties(token: string, f: Fetch = fetch) {
  const body = await get('https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200', token, f);
  return (body.accountSummaries ?? []).flatMap((a: any) => (a.propertySummaries ?? []).map((p: any) => ({ account: a.displayName, propertyId: String(p.property).replace('properties/', ''), name: p.displayName })));
}

export async function ga4Details(token: string, propertyId: string, f: Fetch = fetch) {
  const p = await get(`https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}`, token, f);
  return { name: p.displayName, timeZone: p.timeZone, currency: p.currencyCode, industry: p.industryCategory, created: p.createTime };
}

export async function ga4Totals(token: string, propertyId: string, days = 28, f: Fetch = fetch) {
  const body = await get(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, token, f, { method: 'POST',
    body: JSON.stringify({ dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'yesterday' }], metrics: [{ name: 'totalUsers' }, { name: 'sessions' }, { name: 'keyEvents' }] }) });
  const v = body.rows?.[0]?.metricValues ?? [];
  return { days, users: Number(v[0]?.value ?? 0), sessions: Number(v[1]?.value ?? 0), keyEvents: Number(v[2]?.value ?? 0) };
}

export async function gscSites(token: string, f: Fetch = fetch) {
  const body = await get('https://searchconsole.googleapis.com/webmasters/v3/sites', token, f);
  return (body.siteEntry ?? []).map((s: any) => ({ siteUrl: s.siteUrl as string, permission: s.permissionLevel as string }));
}

/** Search Console data lags ~2-3 days, so the window ends 3 days ago. */
export async function gscTotals(token: string, siteUrl: string, days = 28, f: Fetch = fetch, now = Date.now()) {
  const day = (offset: number) => new Date(now + offset * 86_400_000).toISOString().slice(0, 10);
  const body = await get(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, token, f, { method: 'POST',
    body: JSON.stringify({ startDate: day(-days - 2), endDate: day(-3), dataState: 'final' }) });
  const r = body.rows?.[0] ?? {};
  return { days, clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), ctr: Number(r.ctr ?? 0), position: Number(r.position ?? 0) };
}
