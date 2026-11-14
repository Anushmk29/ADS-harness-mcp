// The creative module's only network client: OpenRouter chat (JSON-schema briefs) and images.
// Plain fetch, injectable for tests. Model ids come from env so swapping models needs no code change.
import type { z } from 'zod';

type Fetch = typeof fetch;
const BASE = 'https://openrouter.ai/api/v1';
const MAX_RETRIES = 3;
const RASTER = new Set(['image/png', 'image/jpeg', 'image/webp']);
// Models that reject a ratio get the nearest one; compose.ts crops to the exact size anyway.
const RATIO_FALLBACK: Record<string, string> = { '4:5': '3:4', '9:16': '2:3' };

export interface CallOptions { model?: string; fetchImpl?: Fetch; sleep?: (ms: number) => Promise<void> }

/** fatal = every later call would fail too (bad key, no credits): stop the run, don't just skip the item. */
export class OpenRouterError extends Error {
  constructor(message: string, readonly status: number, readonly fatal = false) { super(message); this.name = 'OpenRouterError'; }
}
export class ContentBlockedError extends OpenRouterError {
  constructor(message: string, readonly reasons: unknown) { super(message, 403); this.name = 'ContentBlockedError'; }
}
export class ImageBlockedError extends Error {
  constructor(message: string) { super(message); this.name = 'ImageBlockedError'; }
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function env(name: string, hint: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} (${hint})`);
  return value;
}

function retryDelay(res: Response, attempt: number): number {
  const header = Number(res.headers.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return header * 1000;
  return 1000 * 2 ** attempt + Math.random() * 250;
}

async function post(path: string, body: unknown, opts: CallOptions): Promise<any> {
  const key = env('OPENROUTER_API_KEY', 'create one at https://openrouter.ai/keys');
  const fetchImpl = opts.fetchImpl ?? fetch, sleep = opts.sleep ?? wait;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}${path}`, {
        method: 'POST', signal: AbortSignal.timeout(120_000), body: JSON.stringify(body),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'marketing-harness' }
      });
    } catch (error) {
      // Network error or timeout. OpenRouter bills images all-or-nothing, so a retry can't double-charge.
      if (attempt < MAX_RETRIES) { await sleep(1000 * 2 ** attempt); continue; }
      throw new OpenRouterError(`OpenRouter ${path} unreachable: ${(error as Error).message}`, 0);
    }
    if (res.ok) return res.json();

    const err = ((await res.json().catch(() => ({}))) as any).error ?? {};
    const message = `OpenRouter ${res.status} on ${path}: ${err.message ?? res.statusText}`;
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) { await sleep(retryDelay(res, attempt)); continue; }
    if (res.status === 401) throw new OpenRouterError(`${message} — check OPENROUTER_API_KEY`, 401, true);
    if (res.status === 402) throw new OpenRouterError(`${message} — top up OpenRouter credits`, 402, true);
    if (res.status === 403) throw new ContentBlockedError(message, err.metadata?.reasons);
    throw new OpenRouterError(message, res.status);
  }
}

function cost(usage: any): number {
  if (typeof usage?.cost === 'number') return usage.cost;
  console.warn('[creative] OpenRouter response had no usage.cost; recording 0');
  return 0;
}

/** Chat completion constrained to a JSON schema, then zod-validated; one corrective retry on invalid output. */
export async function chatJson<T>(system: string, user: string, schema: z.ZodType<T>, jsonSchema: Record<string, unknown>, opts: CallOptions & { name?: string } = {}): Promise<{ data: T; costUsd: number; model: string }> {
  const model = opts.model ?? env('OPENROUTER_TEXT_MODEL', 'an OpenRouter model slug that supports structured_outputs');
  const messages: { role: string; content: string }[] = [{ role: 'system', content: system }, { role: 'user', content: user }];
  let costUsd = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const body = await post('/chat/completions', {
      model, messages, provider: { require_parameters: true },
      response_format: { type: 'json_schema', json_schema: { name: opts.name ?? 'response', strict: true, schema: jsonSchema } }
    }, opts);
    costUsd += cost(body.usage);
    const content: string = body.choices?.[0]?.message?.content ?? '';
    let problem: string;
    try {
      const parsed = schema.safeParse(JSON.parse(content));
      if (parsed.success) return { data: parsed.data, costUsd, model };
      problem = parsed.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
    } catch {
      problem = 'reply was not valid JSON';
    }
    if (attempt === 1) throw new Error(`OpenRouter ${model} returned invalid JSON twice: ${problem}`);
    messages.push({ role: 'assistant', content }, { role: 'user', content: `That JSON failed validation: ${problem}. Reply with the corrected JSON only.` });
  }
  throw new Error('unreachable');
}

export interface GeneratedImage { image: Buffer; mediaType: string; model: string; ratio: string; costUsd: number }

/** One background image. Throws ImageBlockedError when the model returns nothing usable.
 *  `resolution` is sent only when asked: not every model supports 2K, and compose.ts resizes anyway. */
export async function generateImage(prompt: string, ratio: string, opts: CallOptions & { resolution?: '1K' | '2K' } = {}): Promise<GeneratedImage> {
  const model = opts.model ?? env('OPENROUTER_IMAGE_MODEL', 'an OpenRouter image model slug, e.g. google/gemini-2.5-flash-image');
  const request = (r: string) => post('/images', { model, prompt, n: 1, aspect_ratio: r, ...(opts.resolution ? { resolution: opts.resolution } : {}), output_format: 'png' }, opts);
  let used = ratio, body: any;
  try {
    body = await request(ratio);
  } catch (error) {
    // ponytail: any 400 is treated as "ratio unsupported" once; add a per-model capability table if models need more than this.
    if (!(error instanceof OpenRouterError) || error.status !== 400 || !RATIO_FALLBACK[ratio]) throw error;
    used = RATIO_FALLBACK[ratio];
    body = await request(used);
  }
  const item = body.data?.[0];
  if (!item?.b64_json) throw new ImageBlockedError(`${model} returned no image`);
  const mediaType = item.media_type ?? 'image/png';
  if (!RASTER.has(mediaType)) throw new ImageBlockedError(`${model} returned ${mediaType}, need a raster image`);
  return { image: Buffer.from(item.b64_json, 'base64'), mediaType, model, ratio: used, costUsd: cost(body.usage) };
}
