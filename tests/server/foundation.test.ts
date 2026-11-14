import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VisualizationServer } from '../../src/server/server.js';
import { AdsService } from '../../src/modules/ads/service.js';

describe('deployment foundation', () => {
  it('serves a public health probe even when a harness key is set', async () => {
    process.env.HARNESS_KEY = 'secret';
    const server = new VisualizationServer(0, undefined, '127.0.0.1', mkdtempSync(join(tmpdir(), 'health-')));
    const port = await server.start();
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, dataDirWritable: true });
      expect((await fetch(`http://127.0.0.1:${port}/api/status`)).status).toBe(401);
    } finally { delete process.env.HARNESS_KEY; await server.stop(); }
  });

  it('moves a legacy root ads journal into <root>/ads exactly once', () => {
    const root = mkdtempSync(join(tmpdir(), 'ads-legacy-'));
    writeFileSync(join(root, 'control.sqlite'), '');
    const service = new AdsService({ storageDir: root });
    (service as any).adsDir();
    expect(existsSync(join(root, 'ads', 'control.sqlite'))).toBe(true);
    expect(existsSync(join(root, 'control.sqlite'))).toBe(false);
    service.close();
  });
});
