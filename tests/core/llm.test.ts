import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, llmProviders, onLlmCost, resetLlmHealth, LlmUnavailableError } from '../../src/core/llm/index.js';
import { resetAlertDedup } from '../../src/observability/alerts.js';

const providers = [
  { name: 'deepseek', url: 'https://ds/chat', key: 'a', model: 'ds-model' },
  { name: 'openrouter', url: 'https://or/chat', key: 'b', model: 'or-model' }
];
const ok = (content: string, usage: any = { prompt_tokens: 1_000_000, completion_tokens: 0 }) =>
  new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }], usage }));
const sleep = async () => {};
afterEach(() => { resetLlmHealth(); resetAlertDedup(); });

describe('llm layer', () => {
  it('retries 429 then succeeds and reports cost', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('slow down', { status: 429 })).mockResolvedValueOnce(ok('hi'));
    const costs: any[] = []; const off = onLlmCost(e => costs.push(e));
    const r = await chat({ messages: [], purpose: 'test' }, { fetch: f, sleep, providers });
    off();
    expect(r).toMatchObject({ provider: 'deepseek', costUsd: 0.28 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(costs).toEqual([expect.objectContaining({ purpose: 'test', provider: 'deepseek', costUsd: 0.28 })]);
  });

  it('falls back on 401 and skips the bad provider for 15 minutes', async () => {
    let t = 0;
    const f = vi.fn(async (url: string) => url.startsWith('https://ds') ? new Response('bad key', { status: 401 }) : ok('from or', { cost: 0.01 }));
    const r = await chat({ messages: [], purpose: 'test' }, { fetch: f as any, sleep, providers, now: () => t });
    expect(r).toMatchObject({ provider: 'openrouter', costUsd: 0.01 });
    t = 60_000;
    await chat({ messages: [], purpose: 'test' }, { fetch: f as any, sleep, providers, now: () => t });
    expect(f.mock.calls.filter(c => String(c[0]).startsWith('https://ds'))).toHaveLength(1);
  });

  it('throws a clean error when every provider is down', async () => {
    const f = vi.fn(async () => new Response('boom', { status: 503 }));
    await expect(chat({ messages: [], purpose: 'test' }, { fetch: f as any, sleep, providers })).rejects.toBeInstanceOf(LlmUnavailableError);
    expect(f).toHaveBeenCalledTimes(8); // 4 attempts x 2 providers
  });

  it('builds the chain from env, honouring LLM_ORDER', () => {
    const env = { DEEPSEEK_API_KEY: 'a', DEEPSEEK_MODEL: 'd', OPENROUTER_API_KEY: 'b', OPENROUTER_TEXT_MODEL: 'o', LLM_ORDER: 'openrouter' };
    expect(llmProviders(env).map(p => p.name)).toEqual(['openrouter', 'deepseek']);
    expect(llmProviders({ OPENROUTER_API_KEY: 'b' })).toEqual([]);
  });
});
