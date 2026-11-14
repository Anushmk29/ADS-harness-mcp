#!/usr/bin/env node
// One real, paid image: hand-written shot → OpenRouter → exact 1080×1350 PNG with our overlay.
// Usage: pnpm build && node --env-file=.env bin/creative-mvp.js
import fs from 'node:fs';
import { ConfigLoader } from '../dist/config/config-loader.js';
import { buildPrompt } from '../dist/modules/creative/prompt.js';
import { generateImage } from '../dist/modules/creative/openrouter.js';
import { compose } from '../dist/modules/creative/compose.js';
import { META_FORMATS } from '../dist/modules/creative/specs.js';

const brand = ConfigLoader.loadConfig().brand.visual;
if (!brand) throw new Error('Add brand.visual to config/business.yaml first');
const shot = {
  subject: 'a modern dental clinic reception desk with a single smartphone face-up on the counter',
  action: 'the phone screen glowing softly with an unanswered call',
  context: 'empty waiting room at lunch hour, warm late-afternoon light through blinds',
  composition: 'eye-level medium shot, desk and phone in the lower half, shallow depth of field',
  style: 'editorial magazine photograph, natural light, muted tones'
};
const overlay = ['Missed calls = lost patients', 'Fixed in 2 weeks'];

const { prompt, removed } = buildPrompt(shot, brand);
console.log('prompt:', prompt, removed.length ? `\nstripped: ${removed.join(', ')}` : '');
const out = await generateImage(prompt, META_FORMATS.feed_portrait.ratio);
const png = await compose(out.image, META_FORMATS.feed_portrait, overlay, brand);
fs.mkdirSync('runs/creative/mvp', { recursive: true });
const file = `runs/creative/mvp/feed_portrait-1080x1350-${Date.now()}.png`;
fs.writeFileSync(file, png);
console.log(JSON.stringify({ file, model: out.model, requestedRatio: '4:5', usedRatio: out.ratio, costUsd: out.costUsd }, null, 2));
