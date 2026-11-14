import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { chatJson, ContentBlockedError, generateImage, ImageBlockedError, OpenRouterError } from '../../src/modules/creative/openrouter.js';

const png = Buffer.from('fake-png').toString('base64');
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const ok = (cost = 0.04) => json(200, { data: [{ b64_json: png, media_type: 'image/png' }], usage: { cost } });
const fail = (status: number, extra: Record<string, unknown> = {}, headers?: Record<string, string>) =>
  json(status, { error: { code: status, message: `boom ${status}`, ...extra } }, headers);

function mockFetch(...responses: Response[]) {
  const calls: any[] = [];
  const fetchImpl = vi.fn(async (_url: any, init: any) => { calls.push({ url: String(_url), body: JSON.parse(init.body) }); return responses.shift()!; });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}
const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };

beforeEach(() => {
  sleeps.length = 0;
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('OPENROUTER_IMAGE_MODEL', 'img/model');
  vi.stubEnv('OPENROUTER_TEXT_MODEL', 'txt/model');
});
afterEach(() => vi.unstubAllEnvs());

describe('generateImage', () => {
  it('posts to /images and returns the decoded image with real cost', async () => {
    const { fetchImpl, calls } = mockFetch(ok(0.039));
    const out = await generateImage('a prompt', '4:5', { fetchImpl, sleep });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/images');
    expect(calls[0].body).toEqual({ model: 'img/model', prompt: 'a prompt', n: 1, aspect_ratio: '4:5', output_format: 'png' });
    expect(out.image.toString()).toBe('fake-png');
    expect(out).toMatchObject({ costUsd: 0.039, ratio: '4:5', model: 'img/model' });
  });

  it('honours Retry-After on 429, backs off on 502, then succeeds', async () => {
    const { fetchImpl } = mockFetch(fail(429, {}, { 'Retry-After': '3' }), fail(502), ok());
    await generateImage('p', '1:1', { fetchImpl, sleep });
    expect(sleeps[0]).toBe(3000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000);
  });

  it('gives up after 3 retries', async () => {
    const { fetchImpl } = mockFetch(fail(503), fail(503), fail(503), fail(503));
    await expect(generateImage('p', '1:1', { fetchImpl, sleep })).rejects.toMatchObject({ status: 503, fatal: false });
    expect(sleeps).toHaveLength(3);
  });

  it('401 and 402 are fatal and not retried', async () => {
    for (const status of [401, 402]) {
      const { fetchImpl } = mockFetch(fail(status));
      const err = await generateImage('p', '1:1', { fetchImpl, sleep }).catch(e => e);
      expect(err).toBeInstanceOf(OpenRouterError);
      expect(err).toMatchObject({ status, fatal: true });
    }
    expect(sleeps).toHaveLength(0);
  });

  it('403 moderation becomes ContentBlockedError with reasons', async () => {
    const { fetchImpl } = mockFetch(fail(403, { metadata: { reasons: ['violence'] } }));
    const err = await generateImage('p', '1:1', { fetchImpl, sleep }).catch(e => e);
    expect(err).toBeInstanceOf(ContentBlockedError);
    expect(err.reasons).toEqual(['violence']);
  });

  it('falls back to the nearest ratio once on 400', async () => {
    const { fetchImpl, calls } = mockFetch(fail(400), ok());
    const out = await generateImage('p', '4:5', { fetchImpl, sleep });
    expect(calls.map(c => c.body.aspect_ratio)).toEqual(['4:5', '3:4']);
    expect(out.ratio).toBe('3:4');
  });

  it('rejects empty data and non-raster output', async () => {
    await expect(generateImage('p', '1:1', { fetchImpl: mockFetch(json(200, { data: [] })).fetchImpl, sleep })).rejects.toBeInstanceOf(ImageBlockedError);
    await expect(generateImage('p', '1:1', { fetchImpl: mockFetch(json(200, { data: [{ b64_json: png, media_type: 'image/svg+xml' }] })).fetchImpl, sleep })).rejects.toBeInstanceOf(ImageBlockedError);
  });

  it('records 0 when usage.cost is missing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await generateImage('p', '1:1', { fetchImpl: mockFetch(json(200, { data: [{ b64_json: png }] })).fetchImpl, sleep });
    expect(out.costUsd).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('explains a missing key before any request', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { fetchImpl } = mockFetch();
    await expect(generateImage('p', '1:1', { fetchImpl, sleep })).rejects.toThrow(/OPENROUTER_API_KEY.*openrouter\.ai\/keys/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('chatJson', () => {
  const schema = z.object({ headline: z.string().max(10) });
  const jsonSchema = { type: 'object', properties: { headline: { type: 'string' } }, required: ['headline'], additionalProperties: false };
  const reply = (content: string, cost = 0.001) => json(200, { choices: [{ message: { content } }], usage: { cost } });

  it('requests strict json_schema with require_parameters and returns parsed data', async () => {
    const { fetchImpl, calls } = mockFetch(reply('{"headline":"Hi"}'));
    const out = await chatJson('sys', 'user', schema, jsonSchema, { fetchImpl, sleep, name: 'brief' });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(calls[0].body).toMatchObject({
      model: 'txt/model', provider: { require_parameters: true },
      response_format: { type: 'json_schema', json_schema: { name: 'brief', strict: true, schema: jsonSchema } }
    });
    expect(out).toEqual({ data: { headline: 'Hi' }, costUsd: 0.001, model: 'txt/model' });
  });

  it('retries once with the validation errors, summing cost', async () => {
    const { fetchImpl, calls } = mockFetch(reply('{"headline":"Way too long headline"}'), reply('{"headline":"Short"}'));
    const out = await chatJson('sys', 'user', schema, jsonSchema, { fetchImpl, sleep });
    expect(out.data.headline).toBe('Short');
    expect(out.costUsd).toBeCloseTo(0.002);
    expect(calls[1].body.messages.at(-1).content).toMatch(/headline: .*10/);
  });

  it('fails loudly after a second invalid reply', async () => {
    const { fetchImpl } = mockFetch(reply('not json'), reply('{"nope":1}'));
    await expect(chatJson('sys', 'user', schema, jsonSchema, { fetchImpl, sleep })).rejects.toThrow(/invalid JSON twice/);
  });
});
