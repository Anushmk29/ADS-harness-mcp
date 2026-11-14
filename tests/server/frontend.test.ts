import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('client frontend', () => {
  it('ships the live floor, client dashboard and decode view', () => {
    const html = readFileSync('public/index.html', 'utf8');
    expect([...html.matchAll(/class="view-panel/g)]).toHaveLength(3);
    expect(html).toContain('id="view-3d"');
    expect(html).toContain('id="view-overview"');
    expect(html).toContain('id="view-decode"');
    expect(html).not.toMatch(/content-view|agents-view|tasks-view|audit-view|business-view|command-bar/);
  });
});
