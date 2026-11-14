import http from 'node:http';

/**
 * Tiny localhost OAuth loopback listener.
 *
 * Google's OAuth (Google Ads API + GA4 Data API) requires a redirect URI.
 * For a CLI/local agent process we open a random-loopback-port redirect URI that
 * captures the `?code=` (and optional `state`) the browser sends back after the
 * operator signs in. We do NOT auto-open a browser; the caller prints the auth URL
 * and the operator opens it (headless/VPS friendly).
 *
 * Usage:
 *   const ln = await createLoopback();
 *   const redirectUri = `http://127.0.0.1:${ln.port}/oauth2callback`;
 *   // ... build auth URL with redirectUri, print it ...
 *   const { code } = await ln.waitForCode(300000);
 */

export interface LoopbackResult {
  code?: string;
  error?: string;
  state?: string;
  fullQuery: string;
}

export interface Loopback {
  port: number;
  redirectUri: string;
  waitForCode(timeoutMs?: number): Promise<LoopbackResult>;
  close(): void;
}

export async function createLoopback(host = '127.0.0.1'): Promise<Loopback> {
  if (!['127.0.0.1', '::1'].includes(host)) throw new Error('OAuth callback must bind to loopback');
  const authority = host === '::1' ? '[::1]' : host;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${authority}`);
    if (url.pathname !== '/oauth2callback') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      '<!doctype html><html><head><title>Auth</title></head><body>' +
        '<h3>Sign-in complete. You may close this tab.</h3></body></html>'
    );
    resolveResult({
      code: url.searchParams.get('code') || undefined,
      error: url.searchParams.get('error') || undefined,
      state: url.searchParams.get('state') || undefined,
      fullQuery: url.search
    });
  });

  let resolveResult: (r: LoopbackResult) => void = () => {};
  const promise = new Promise<LoopbackResult>((resolve) => { resolveResult = resolve; });

  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve); });

  let port = 0;
  try {
    const info = server.address();
    if (typeof info === 'object' && info && typeof info.port === 'number') port = info.port;
  } catch { /* keep 0 */ }

  return {
    port,
    redirectUri: `http://${authority}:${port}/oauth2callback`,
    async waitForCode(timeoutMs = 300000) {
      const timer = setTimeout(() => resolveResult({ error: 'timeout', fullQuery: '' }), timeoutMs);
      try {
        return await promise;
      } finally {
        clearTimeout(timer);
        server.close();
      }
    },
    close() {
      try { server.close(); } catch { /* noop */ }
    }
  };
}
