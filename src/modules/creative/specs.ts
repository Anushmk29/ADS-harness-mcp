// Meta placement specs for generated creatives. Sizes are what compose.ts guarantees on output;
// the image model is only asked for the ratio and its raw size is cropped to these.

export const META_FORMATS = {
  feed_portrait: { ratio: '4:5', w: 1080, h: 1350 },  // primary placement, generate first
  feed_square: { ratio: '1:1', w: 1080, h: 1080 },
  story_reel: { ratio: '9:16', w: 1080, h: 1920 },
  carousel_card: { ratio: '1:1', w: 1080, h: 1080 }
} as const;

export type MetaFormatName = keyof typeof META_FORMATS;
export type MetaFormat = (typeof META_FORMATS)[MetaFormatName];

// Fractions of height to keep text out of (Reels/Stories UI chrome).
// ponytail: ~14% top / ~35% bottom from Meta's Reels guidance; verify against the current Ads Guide before launch.
export const SAFE_ZONE: Record<string, { top: number; bottom: number }> = {
  '9:16': { top: 0.14, bottom: 0.35 },
  '4:5': { top: 0, bottom: 0 },
  '1:1': { top: 0, bottom: 0 }
};

export const LIMITS = {
  overlayText: 25,
  overlayPhrases: 3,
  headline: 40,
  primaryText: 125,
  carouselDescription: 20,
  carouselCards: { min: 2, max: 10 }
} as const;
