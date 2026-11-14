// Crop a generated background to an exact Meta size and render the ad's copy on top as SVG.
// Text is ours, not the image model's: spelling and character limits are guaranteed here.
import { esc, wrap } from '../../core/svg-text.js';
import { LIMITS, SAFE_ZONE, type MetaFormat } from './specs.js';
import type { BrandVisual } from './prompt.js';

const FONT = 'Arial, Helvetica, sans-serif';

export interface ComposeOptions { index?: number; total?: number }

export function overlaySvg(format: MetaFormat, overlay: string[], brand: BrandVisual, opts: ComposeOptions = {}): string {
  const { w, h } = format;
  const pad = Math.round(w * 0.09);
  const zone = SAFE_ZONE[format.ratio] ?? { top: 0, bottom: 0 };
  const top = zone.top * h + pad, bottom = h - zone.bottom * h - pad * 0.6;
  const fits = (size: number) => Math.floor((w - 2 * pad) / (size * 0.55));
  const { background: bg, text: ink, primary: accent } = brand.colors;

  // Headline shrinks until it fits in three lines; supporting phrases are set smaller in the accent colour.
  const [headline = '', ...rest] = overlay.slice(0, LIMITS.overlayPhrases);
  let size = Math.round(w * 0.1), lines = wrap(headline, fits(size));
  while (lines.length > 3 && size > 48) { size -= 8; lines = wrap(headline, fits(size)); }
  const subSize = Math.round(size * 0.45);

  let y = top + 40;
  const texts: string[] = [];
  for (const line of lines) { y += size * 1.15; texts.push(`<text x="${pad}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${size}" fill="${ink}">${esc(line)}</text>`); }
  for (const phrase of rest) for (const line of wrap(phrase, fits(subSize))) {
    y += subSize * 1.4;
    texts.push(`<text x="${pad}" y="${y}" font-family="${FONT}" font-weight="700" font-size="${subSize}" fill="${accent}">${esc(line)}</text>`);
  }

  const footer = [
    brand.wordmark ? `<text x="${pad}" y="${bottom}" font-family="${FONT}" font-size="${Math.round(w * 0.03)}" fill="${accent}" letter-spacing="4">${esc(brand.wordmark)}</text>` : '',
    opts.total ? `<text x="${w - pad}" y="${bottom}" text-anchor="end" font-family="${FONT}" font-size="${Math.round(w * 0.03)}" fill="${ink}" opacity="0.7">${opts.index}/${opts.total}</text>` : ''
  ].join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
<defs>
<linearGradient id="top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg}" stop-opacity="0.88"/><stop offset="0.75" stop-color="${bg}" stop-opacity="0.6"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></linearGradient>
<linearGradient id="bottom" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${bg}" stop-opacity="0.75"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/></linearGradient>
</defs>
${texts.length ? `<rect width="${w}" height="${y + pad * 1.5}" fill="url(#top)"/>
<rect x="${pad}" y="${top}" width="${Math.round(w * 0.11)}" height="8" fill="${accent}"/>` : ''}
${footer ? `<rect y="${bottom - pad * 1.6}" width="${w}" height="${h - bottom + pad * 1.6}" fill="url(#bottom)"/>` : ''}
${texts.join('\n')}
${footer}
</svg>`;
}

/** Exact-size PNG: cover-crop the background, composite the overlay, assert the dimensions. */
export async function compose(image: Buffer, format: MetaFormat, overlay: string[], brand: BrandVisual, opts: ComposeOptions = {}): Promise<Buffer> {
  const { default: sharp } = await import('sharp');
  const base = await sharp(image).resize(format.w, format.h, { fit: 'cover', position: 'attention' }).toBuffer();
  const png = await sharp(base).composite([{ input: Buffer.from(overlaySvg(format, overlay, brand, opts)) }]).png().toBuffer();
  const meta = await sharp(png).metadata();
  if (meta.width !== format.w || meta.height !== format.h) throw new Error(`compose produced ${meta.width}x${meta.height}, expected ${format.w}x${format.h}`);
  return png;
}
