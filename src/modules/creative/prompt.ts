// Image prompts are assembled only from validated shot fields + brand visuals, never from raw user text.
// The image model is told to draw no text: compose.ts renders all copy as an SVG overlay.
import type { BusinessConfig } from '../../config/config-loader.js';

export interface Shot { subject: string; action: string; context: string; composition: string; style: string }

/** `brand.visual` from config/business.yaml. */
export type BrandVisual = NonNullable<BusinessConfig['brand']['visual']>;

// Quality-bait words that degrade image-model output; stripped wherever they appear.
const BANNED = [
  '8k', '4k', 'ultra[ -]?hd', 'high[ -]?resolution', 'masterpiece', 'best quality', 'ultra[ -]?realistic',
  'hyper[ -]?realistic', 'trending on artstation', 'highly detailed', 'ultra[ -]?detailed', 'award[ -]?winning'
];
const bannedRe = new RegExp(`\\b(?:${BANNED.join('|')})\\b`, 'gi');

export function stripBanned(text: string): { text: string; removed: string[] } {
  const removed = text.match(bannedRe) ?? [];
  const cleaned = text.replace(bannedRe, '')
    .replace(/\s*,\s*(?:,\s*)+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
  return { text: cleaned, removed: removed.map(w => w.toLowerCase()) };
}

export function buildPrompt(shot: Shot, brand: BrandVisual): { prompt: string; removed: string[] } {
  const parts = [
    shot.subject, shot.action, shot.context, shot.composition, shot.style,
    `brand colors ${brand.colors.primary} and ${brand.colors.secondary}`,
    `${brand.mood.join(', ')} atmosphere`,
    `${brand.texture} texture`,
    `${brand.negativeSpace} composition`,
    ['no text', 'no letters', 'no words', 'no logos', ...brand.forbidden.map(f => `no ${f}`)].join(', ')
  ];
  const { text, removed } = stripBanned(parts.map(p => p.trim()).filter(Boolean).join(', '));
  return { prompt: text, removed };
}
