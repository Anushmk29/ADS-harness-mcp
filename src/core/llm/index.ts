// One chat entry point for every LLM caller: "whatever is connected and working gets used".
// Providers are OpenAI-compatible chat endpoints built from the keys present; OpenRouter covers Claude/GPT/etc.
import { alert } from '../../observability/alerts.js';
import { logger } from '../../observability/logger.js';

type Fetch = typeof fetch;
export interface LlmProvider { name: string; url: string; key: string; model: string }
/** essential: client-facing work (approvals, reads) that still runs over budget. */
export interface ChatRequest { messages: any[]; tools?: any[]; json?: boolean; purpose: string; timeoutMs?: number; essential?: boolean }
export interface ChatResult { message: any; usage?: any; costUsd: number; provider: string; model: string }
export interface ChatOptions { fetch?: Fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; providers?: LlmProvider[] }
export interface CostEvent { purpose: string; provider: string; model: string; usage?: any; costUsd: number; at: number }

const MAX_RETRIES = 3;
const UNHEALTHY_MS = 15 * 60_000;
const unhealthyUntil = new Map<string, number>();
const costListeners = new Set<(event: CostEvent) => void>();
let spendSource: (() => number) | undefined;

/** Month-to-date LLM spend for the budget guard (the tracking ledger provides it). */
export function setLlmSpendSource(source: (() => number) | undefined) { spendSource = source; }

export class LlmUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = 'LlmUnavailableError'; }
}
export class LlmBudgetError extends Error {
  constructor(message: string) { super(message); this.name = 'LlmBudgetError'; }
}

/** LLM_MONTHLY_BUDGET_USD: alert at 80%, refuse non-essential calls at 100%. */
async function checkBudget(request: ChatRequest, now: number) {
  const budget = Number(process.env.LLM_MONTHLY_BUDGET_USD);
  if (!spendSource || !Number.isFinite(budget) || budget <= 0) return;
  const spent = spendSource(), month = new Date(now).toISOString().slice(0, 7);
  if (spent >= budget) {
    await alert('critical', `llm-budget-100:${month}`, `LLM spend ${spent.toFixed(2)} reached the ${budget} monthly budget; non-essential work is paused`);
    if (!request.essential) throw new LlmBudgetError(`Monthly LLM budget (${budget}) reached; ${request.purpose} skipped`);
  } else if (spent >= 0.8 * budget) {
    await alert('warn', `llm-budget-80:${month}`, `LLM spend ${spent.toFixed(2)} is over 80% of the ${budget} monthly budget`);
  }
}

/** Providers from env, ordered by LLM_ORDER (e.g. "openrouter,deepseek"), else the order below. */
export function llmProviders(env: NodeJS.ProcessEnv = process.env): LlmProvider[] {
  const all: LlmProvider[] = [];
  if (env.DEEPSEEK_API_KEY && env.DEEPSEEK_MODEL) all.push({ name: 'deepseek', url: 'https://api.deepseek.com/chat/completions', key: env.DEEPSEEK_API_KEY, model: env.DEEPSEEK_MODEL });
  if (env.OPENROUTER_API_KEY && env.OPENROUTER_TEXT_MODEL) all.push({ name: 'openrouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: env.OPENROUTER_API_KEY, model: env.OPENROUTER_TEXT_MODEL });
  const order = (env.LLM_ORDER ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const rank = (p: LlmProvider) => { const i = order.indexOf(p.name); return i === -1 ? order.length : i; };
  return all.sort((a, b) => rank(a) - rank(b));
}

/** Subscribe to per-call cost (the tracking ledger registers here). Returns an unsubscribe function. */
export function onLlmCost(listener: (event: CostEvent) => void): () => void {
  costListeners.add(listener);
  return () => costListeners.delete(listener);
}

/** DeepSeek list prices per 1M tokens; override with LLM_DEEPSEEK_USD_PER_M_INPUT/OUTPUT. OpenRouter reports usage.cost itself. */
export function costOf(provider: string, usage: any, env: NodeJS.ProcessEnv = process.env): number {
  if (typeof usage?.cost === 'number') return usage.cost;
  if (provider !== 'deepseek') return 0;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return (n(usage?.prompt_tokens) * Number(env.LLM_DEEPSEEK_USD_PER_M_INPUT ?? 0.28) + n(usage?.completion_tokens) * Number(env.LLM_DEEPSEEK_USD_PER_M_OUTPUT ?? 0.42)) / 1_000_000;
}

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const backoff = (attempt: number, retryAfter: string | null) => {
  const s = retryAfter ? Number(retryAfter) : NaN;
  return Number.isFinite(s) && s > 0 ? Math.min(60_000, s * 1000) : 1000 * 2 ** attempt + Math.random() * 250;
};

/**
 * Try each healthy provider in order. 429/5xx/network errors retry with backoff (honouring Retry-After);
 * 401/402 mark the provider unhealthy for 15 min and fall through to the next one. All down → alert + LlmUnavailableError.
 */
export async function chat(request: ChatRequest, options: ChatOptions = {}): Promise<ChatResult> {
  const f = options.fetch ?? fetch, sleep = options.sleep ?? wait, now = options.now ?? Date.now;
  const providers = options.providers ?? llmProviders();
  if (!providers.length) throw new LlmUnavailableError('No LLM configured: set DEEPSEEK_API_KEY+DEEPSEEK_MODEL or OPENROUTER_API_KEY+OPENROUTER_TEXT_MODEL');
  await checkBudget(request, now());
  const errors: string[] = [];
  for (const p of providers) {
    if ((unhealthyUntil.get(p.name) ?? 0) > now()) { errors.push(`${p.name}: skipped (unhealthy)`); continue; }
    const body = JSON.stringify({
      model: p.model, messages: request.messages, stream: false,
      ...(request.tools ? { tools: request.tools } : {}),
      ...(request.json ? { response_format: { type: 'json_object' } } : {})
    });
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await f(p.url, { method: 'POST', body, signal: AbortSignal.timeout(request.timeoutMs ?? 120_000),
          headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json', 'X-Title': 'marketing-harness' } });
      } catch (e: any) {
        if (attempt < MAX_RETRIES) { await sleep(backoff(attempt, null)); continue; }
        errors.push(`${p.name}: unreachable (${e.message})`); break;
      }
      if (res.ok) {
        const json = await res.json() as any;
        const message = json.choices?.[0]?.message;
        if (!message) { errors.push(`${p.name}: no message in response`); break; }
        const costUsd = costOf(p.name, json.usage);
        const event = { purpose: request.purpose, provider: p.name, model: p.model, usage: json.usage, costUsd, at: now() };
        for (const listener of costListeners) { try { listener(event); } catch (e: any) { logger.warn('LLM', `cost listener failed: ${e.message}`); } }
        return { message, usage: json.usage, costUsd, provider: p.name, model: p.model };
      }
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) { await sleep(backoff(attempt, res.headers.get('retry-after'))); continue; }
      if (res.status === 401 || res.status === 402) {
        unhealthyUntil.set(p.name, now() + UNHEALTHY_MS);
        await alert('critical', `llm-auth:${p.name}`, `${p.name} ${res.status} (${res.status === 402 ? 'out of credit' : 'bad key'}); falling back for 15 min`);
      }
      errors.push(`${p.name}: ${res.status} ${detail}`);
      break;
    }
  }
  const message = `All LLM providers failed for ${request.purpose}: ${errors.join(' | ')}`;
  await alert('critical', 'llm-all-down', message);
  throw new LlmUnavailableError(message);
}

/** Test hook. */
export function resetLlmHealth() { unhealthyUntil.clear(); }
