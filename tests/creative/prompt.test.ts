import { describe, expect, it } from 'vitest';
import { buildPrompt, stripBanned, type BrandVisual } from '../../src/modules/creative/prompt.js';
import { compose, overlaySvg } from '../../src/modules/creative/compose.js';
import { META_FORMATS } from '../../src/modules/creative/specs.js';

const brand: BrandVisual = {
  colors: { primary: '#d4af37', secondary: '#f5f1e6', background: '#0b0b0c', text: '#f5f1e6' },
  mood: ['calm', 'precise'], texture: 'matte', negativeSpace: 'clean empty upper third',
  forbidden: ['stock-photo handshakes'], wordmark: 'PRATAP AI'
};
const shot = {
  subject: 'a clinic front desk at dusk', action: 'phone lighting up with a missed call',
  context: 'quiet waiting room', composition: 'low angle, subject in lower half', style: 'editorial magazine photograph, 8K masterpiece'
};

describe('buildPrompt', () => {
  it('orders the five components, injects brand, forbids drawn text', () => {
    const { prompt } = buildPrompt(shot, brand);
    expect(prompt.indexOf('a clinic front desk')).toBeLessThan(prompt.indexOf('editorial magazine'));
    expect(prompt).toContain('brand colors #d4af37 and #f5f1e6');
    expect(prompt).toContain('calm, precise atmosphere');
    expect(prompt).toContain('clean empty upper third composition');
    expect(prompt).toMatch(/no text, no letters, no words, no logos, no stock-photo handshakes$/);
  });

  it('strips banned quality-bait words and reports them', () => {
    const { prompt, removed } = buildPrompt(shot, brand);
    expect(prompt).not.toMatch(/8k|masterpiece/i);
    expect(removed).toEqual(['8k', 'masterpiece']);
    expect(prompt).not.toMatch(/,\s*,|\s{2}/);
  });

  it('matches banned variants case-insensitively without eating normal words', () => {
    expect(stripBanned('Ultra-Realistic portrait, Award Winning light, 4K').removed).toEqual(['ultra-realistic', 'award winning', '4k']);
    expect(stripBanned('a 4Kids poster, highly detailed').text).toBe('a 4Kids poster');
  });
});

describe('compose', () => {
  it('crops any input to the exact Meta size', async () => {
    const { default: sharp } = await import('sharp');
    const odd = await sharp({ create: { width: 1792, height: 2400, channels: 3, background: '#335' } }).png().toBuffer();
    for (const format of [META_FORMATS.feed_portrait, META_FORMATS.story_reel, META_FORMATS.carousel_card]) {
      const meta = await sharp(await compose(odd, format, ['Missed calls cost you', 'Fix it in 2 weeks'], brand, { index: 1, total: 3 })).metadata();
      expect([meta.width, meta.height]).toEqual([format.w, format.h]);
    }
  });

  it('escapes copy and keeps 9:16 text below the top safe zone', () => {
    const svg = overlaySvg(META_FORMATS.story_reel, ['Calls & <bookings>'], brand);
    expect(svg).toContain('Calls &amp;');
    expect(svg).toContain('&lt;bookings&gt;');
    const firstY = Number(svg.match(/<text[^>]* y="([\d.]+)"/)![1]);
    expect(firstY).toBeGreaterThan(0.14 * 1920);
  });
});
