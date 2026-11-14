# Ad Creative Pipeline — Build Brief (v3, fitted to marketing-harness, OpenRouter)

**Purpose:** add brand-consistent ad image + carousel generation to marketing-harness
as a new module, `src/modules/creative/`, that ends in a **paused Meta ad behind
approval** — not a folder of loose PNGs.

**All generation goes through OpenRouter with one key (`OPENROUTER_API_KEY`):**
the copy/concept brief (chat completions) and the images (images endpoint). Swapping
the text or image model is an env change, not a code change.

**Supersedes v1**, which specced a standalone Python project. v1 was dropped because it:
- added a second language/runtime to a TypeScript repo (pnpm, vitest, zod, sharp);
- rebuilt things that already exist here: carousel rendering (`src/modules/content/slides.ts`),
  brand voice (`config/business.yaml`), Meta image upload + paused-ad creation + approval
  (`src/modules/ads`);
- had no LLM in the steps that need one (brand voice, concepts, copy);
- had first-run bugs (exact-pixel checks on generated output, `parts[0]` image parsing,
  markdown as an inter-step data contract, MCP config in the wrong file with an inline key).

**Estimated build:** ~4–6 hours. MVP (one generated + overlaid 4:5 image): ~1.5 hours.

---

## 1. Pipeline

```
business.yaml ──► brief.ts ──────► openrouter.ts ──► compose.ts ──► manifest ──► ads module
 (brand, voice)   (OpenRouter       (OpenRouter       (sharp: crop    (JSON)       meta_ads_upload_image
                   chat, JSON        images endpoint,  to exact Meta                → paused ad
                   schema, zod)      background only,  size + SVG text              → HITL approval
                                     no text)          overlay)
```

**Key design decision — the image model never draws text.** The image model generates
the background/visual only; headline and CTA text are rendered by us as an SVG overlay
(same technique as `slides.ts`). This gives perfect spelling, enforces character
limits in code, keeps carousel cards visually consistent, and removes the need for an
OCR/vision "readability" check. It also means any OpenRouter image model works, not
only ones that render text well.

---

## 2. Files

```
src/modules/creative/
├── index.ts        ← CreativeModule implements MarketingModule (capabilities + run)
├── openrouter.ts   ← the ONLY network client: chatJson() + generateImage(); errors, backoff, cost
├── brief.ts        ← system prompt + schema → chatJson() → CreativeBrief (zod)
├── prompt.ts       ← pure: (shot, brand) → prompt string; banned-word filter
├── compose.ts      ← sharp: cover-crop to exact spec + SVG text overlay
└── specs.ts        ← Meta formats, safe zones, text limits (constants)

tests/creative/
├── prompt.test.ts      ← brand injection, banned words stripped, limits
├── openrouter.test.ts  ← mocked fetch: 402/403-moderation/429-Retry-After/502, empty data, cost
└── pipeline.test.ts    ← mocked OpenRouter → manifest + exact output dimensions
```

Six source files, three test files. **Not created:** a config module (constants live
in `specs.ts`, keys and model ids in env), `quality_gate`, `brand_dna`, a vendored
`skills/` folder, an MCP server config, per-provider SDKs. See §9.

Wiring:
- Add `'creative'` to `ModuleId` in `src/core/modules/contracts.ts` and register
  `new CreativeModule(...)` in `src/core/modules/registry.ts`.
- **Module boundaries:** `tests/core/module-boundaries.test.ts` forbids ads↔content imports.
  `creative` must not import from `ads` or `content` either — extend that test to cover it.
  The hand-off to Meta goes through the registry (`modules.get('ads').run(...)`) at the
  orchestration layer, not a direct import.
- If `compose.ts` needs `slides.ts`'s `wrap()`/`esc()`, move those two helpers to a shared
  location (e.g. `src/core/svg-text.ts`) and import from there in both modules — do not copy them.
- The rest of the repo keeps using DeepSeek directly; only the creative module uses
  OpenRouter. To keep the same "brain", set `OPENROUTER_TEXT_MODEL` to a DeepSeek model
  slug on OpenRouter.

---

## 3. `specs.ts` — constants

```ts
export const META_FORMATS = {
  feed_portrait: { ratio: '4:5',  w: 1080, h: 1350 },  // primary — generate first
  feed_square:   { ratio: '1:1',  w: 1080, h: 1080 },
  story_reel:    { ratio: '9:16', w: 1080, h: 1920 },
  carousel_card: { ratio: '1:1',  w: 1080, h: 1080 },
} as const;

// Keep text out of these bands. Meta's Reels/Stories guidance is ~14% top, ~35% bottom.
// VERIFY against Meta's current Ads Guide before launch; these are layout inputs, not facts.
export const SAFE_ZONE = { '9:16': { top: 0.14, bottom: 0.35 }, '4:5': { top: 0, bottom: 0 }, '1:1': { top: 0, bottom: 0 } };

export const LIMITS = { overlayText: 25, overlayPhrases: 3, primaryText: 125, headline: 40, carouselDescription: 20, carouselCards: [2, 10] };
```

Safe zones are fractions, not pixels, so they apply to any size.

---

## 4. `openrouter.ts` — the single API client

One file, two functions, shared error handling. No SDK — plain `fetch`, injectable
`fetchImpl` for tests (same pattern as `classifyBatch` in `src/modules/decode/index.ts`).

```ts
export async function chatJson<T>(system: string, user: string, schema: z.ZodType<T>, jsonSchema: object, opts?: { model?: string; fetchImpl?: Fetch }): Promise<{ data: T; costUsd: number }>
export async function generateImage(prompt: string, ratio: string, opts?: { model?: string; resolution?: '1K' | '2K'; fetchImpl?: Fetch }): Promise<{ png: Buffer; model: string; costUsd: number }>
```

Common:
- Base URL `https://openrouter.ai/api/v1`, header `Authorization: Bearer ${OPENROUTER_API_KEY}`.
  Optional attribution headers `HTTP-Referer` / `X-Title` (app name) — harmless, helps the dashboard.
- Missing `OPENROUTER_API_KEY` → clear error at call time (not at import), linking
  https://openrouter.ai/keys.
- Timeout every request (`AbortSignal.timeout(120_000)`).
- Error body shape is `{ error: { code, message, metadata? } }`. Handling:

| Status | Meaning | Action |
|---|---|---|
| 400 | bad params (e.g. unsupported ratio for that model) | no retry; include `error.message` |
| 401 | bad key | no retry; "check OPENROUTER_API_KEY" |
| 402 | out of credits | no retry; "top up OpenRouter credits"; **stop the whole run** |
| 403 | guardrail / moderation | throw `ContentBlockedError` with `metadata.reasons`; record in `failed[]`, don't retry |
| 429 | rate limited | wait `Retry-After` header, else exponential backoff with jitter; max 3 |
| 502 / 503 | provider down / none available | exponential backoff with jitter (1s, 2s, 4s); max 3 |

`chatJson` (copy/concept brief):
- `POST /chat/completions` with `model: OPENROUTER_TEXT_MODEL`, messages, and
  `response_format: { type: 'json_schema', json_schema: { name: 'creative_brief', strict: true, schema } }`.
- Send `provider: { require_parameters: true }` so OpenRouter only routes to providers
  that support structured outputs for that model. Pick a text model that lists
  `structured_outputs` on its OpenRouter model page.
- Parse `choices[0].message.content` → `JSON.parse` → **zod parse anyway** (strict
  schema is a hint, zod is the contract). On zod failure, retry once with the errors
  appended; then fail loudly.
- Cost: take `usage.cost` if present; if absent record `0` and log a warning
  (verify on first real call which it is).

`generateImage` (visuals):
- `POST /images` with:
  ```json
  { "model": "<OPENROUTER_IMAGE_MODEL>", "prompt": "...", "n": 1,
    "aspect_ratio": "4:5", "output_format": "png" }
  ```
  `resolution` is sent only when the caller asks for it — e.g. `google/gemini-2.5-flash-image`
  is ~1K only, and `compose.ts` resizes to the exact spec anyway.
- Response: `data[0].b64_json` (+ `media_type`), `usage.cost`. Empty `data` → throw
  `ImageBlockedError`. If `media_type` is not PNG/JPEG/WebP, reject (e.g. SVG output from
  some models) — sharp needs a raster.
- **Aspect ratio support varies by model.** Keep a small `nearestRatio(model, ratio)`
  fallback: if the model rejects `4:5`, request `3:4`; `compose.ts` crops to the exact
  size either way. Don't build a per-model capability table until a real model needs it.
- Billing is all-or-nothing per image: failed/cancelled requests aren't charged, so a
  retry after a 5xx doesn't double-bill. Use `usage.cost` as the real per-image cost.
- Default image model: one you've test-generated with, e.g. `google/gemini-2.5-flash-image`
  (other candidates on OpenRouter: `bytedance-seed/seedream-4.5`, `black-forest-labs/flux.2-pro`,
  `openai/gpt-image-1`). Check current availability and price on openrouter.ai/models
  before the first paid run. Because text is overlaid by us, choose on visual quality and price.
- No streaming — not needed for batch generation.

---

## 5. `brief.ts` — the copy/concept step

Input: `brand` block from `config/business.yaml` + campaign params (objective,
audience, offer, concept count, formats). Calls `chatJson()` with the zod schema below
and its JSON Schema equivalent (write the JSON Schema by hand next to the zod schema,
or use `zod-to-json-schema` only if it's already installed — don't add a dependency for it).

```ts
const shotSchema = z.object({
  subject: z.string(), action: z.string(), context: z.string(),
  composition: z.string(), style: z.string(),           // the 5-component formula, as data
});
const conceptSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  framework: z.enum(['AIDA','PAS','BAB','4P','FAB','STAR']),
  headline: z.string().max(40), primaryText: z.string().max(125), cta: z.string(),
  overlay: z.array(z.string().max(25)).max(3),           // text WE render on the image
  shot: shotSchema,
  carousel: z.array(z.object({ overlay: z.array(z.string().max(25)).max(3), description: z.string().max(20), shot: shotSchema })).max(10).optional(),
});
export const briefSchema = z.object({ concepts: z.array(conceptSchema).min(1).max(5) });
```

- The brief is **JSON**, persisted as `brief.json` in the run folder. No markdown parsing.
- Pass `brand.bannedPhrases` into the system prompt **and** reject any concept whose copy
  contains one (check in code, don't trust the model).
- Copy frameworks / thinking framework: put short definitions inline in the system
  prompt. The global `ads-create` skill is reference material for writing that prompt,
  not something the code executes.

---

## 6. `prompt.ts` — pure, fully unit-tested

```ts
export function buildPrompt(shot: Shot, brand: BrandVisual): string
```

Order: `subject, action, context, composition, style`, then brand injection:
`brand colors {primary} and {secondary}, {mood} atmosphere, {texture} texture,
{negativeSpace} composition`, then `no text, no letters, no logos, no {forbidden}`.

- **Always append "no text, no letters, no words"** — text is added by `compose.ts`.
- Leave negative space where the overlay will go (e.g. "clean empty upper third").
- **Banned words** — strip case-insensitively and log: `8K`, `4K`, `ultra HD`,
  `high resolution`, `masterpiece`, `best quality`, `ultra-realistic`, `hyperrealistic`,
  `trending on artstation`, `highly detailed`, `ultra detailed`, `award winning`.
  Prefer style anchors like "editorial magazine photograph", "documentary cover story".
- Raw user text never reaches the image model: it only enters via the zod-validated `shot` fields.
- `BrandVisual` (colors, mood, texture, forbidden) — add a `brand.visual` block to
  `config/business.yaml`. Seed it from the existing gold-on-black palette
  (`#d4af37`, `#f5f1e6`, `#0b0b0c` in `slides.ts`).

---

## 7. `compose.ts` — exact sizes + text overlay

```ts
export async function compose(img: Buffer, format: MetaFormat, overlay: string[], brand: BrandVisual): Promise<Buffer>
```

1. `sharp(img).resize(w, h, { fit: 'cover', position: 'attention' })` → **exact** Meta
   dimensions. Model output size depends on model, ratio and resolution and will not be
   exactly 1080×1350; this step guarantees it (and absorbs any `nearestRatio` fallback).
2. Render `overlay` lines as SVG (wrap/escape helpers shared with `slides.ts`), placed
   outside the format's `SAFE_ZONE`, with a contrast scrim behind the text.
3. Composite, PNG out. Assert output metadata equals the spec (cheap, and it is the real
   "quality gate").
4. Carousel: same brand style anchor in every card's prompt + identical overlay layout +
   `n/total` marker, so cards read as one set even if the visuals vary.

---

## 8. Orchestration, manifest, hand-off

`CreativeModule.run({ capability: 'creative.generate', input })`:

1. `brief.ts` → `brief.json`
2. per concept × format (+ carousel cards): `buildPrompt` → `generateImage` → `compose`
   → `runs/creative/{runId}/{concept}/{format}-{w}x{h}.png`
3. write `manifest.json`:

```json
{
  "runId": "...", "generatedAt": "ISO-8601", "brief": "brief.json",
  "models": { "text": "...", "image": "..." },
  "assets": [{ "concept": "c1", "format": "feed_portrait", "w": 1080, "h": 1350,
               "path": "c1/feed_portrait-1080x1350.png", "model": "...", "prompt": "...",
               "costUsd": 0 }],
  "failed": [{ "concept": "c2", "format": "story_reel", "reason": "ContentBlockedError: ..." }],
  "costUsd": { "text": 0, "images": 0, "total": 0 }
}
```

- One failed image goes in `failed[]`; it never aborts the run. **Exception:** 402
  (out of credits) and 401 stop the run immediately — every later call would fail too.
- **Budget cap:** `maxCostUsd` input (default e.g. 2.00).
  - Before starting: estimate `images × CREATIVE_IMAGE_EST_USD` (env, set from the model's
    OpenRouter price); refuse if over the cap.
  - While running: add each real `usage.cost`; stop generating once the running total
    would exceed the cap and record the rest as `failed: "budget cap"`.
- Costs live in the manifest and the existing journal/observability layer — not in
  `~/.banana/costs.json`. OpenRouter's dashboard is the cross-check.
- **Hand-off (separate capability, `creative.stage_for_meta`, write: true):** for chosen
  assets, call the ads module's `meta_ads_upload_image` (base64 `bytes`) → `image_hash`,
  then build the Meta spec with `creative.imageHash` + the concept's `headline`,
  `primaryText`, `cta` and go through the existing **paused** launch flow and HITL
  approval. Generation never spends ad money; activation still needs separate approval.
- Expose `creative.generate` and `creative.stage_for_meta` in `listCapabilities()` so the
  server/dashboard can call them like other module commands.

---

## 9. Deliberately skipped (and when to add)

| Skipped | Why | Add when |
|---|---|---|
| Brand DNA from URL (`brand_dna`) | Single-business OS; `business.yaml` already holds brand | Running this for client brands |
| Playwright screenshots | Only feeds brand DNA | Same as above |
| AI quality score 1–10 | No vision step yet; would be a stub | Wanted — add a vision call via the same `chatJson` (OpenRouter vision model) scoring text-free visuals |
| Multi-provider fallbacks / SDKs | OpenRouter already is the fallback layer: change the model slug | Never in code — OpenRouter `models: [...]` fallback list if one model is flaky |
| Per-model capability table | Only `nearestRatio` is needed today | A chosen model needs more than ratio fallback |
| Streaming image responses | Batch job, no UI waiting on partials | A live preview UI |
| MCP server (nanobanana etc.) | We call REST directly | Interactive image sessions in Claude Code (`.mcp.json`, key via env, never inline) |
| Vendoring `~/.agents/skills` into the repo | Already installed globally; ~40 duplicate files; licence check needed (see `NOTICE.md`) | Never — reference them, don't copy |
| Video / Reels motion | Out of scope | Image pipeline is live and approved ads exist |

---

## 10. Build order

| # | Step | Done when |
|---|---|---|
| 1 | `specs.ts` + `prompt.ts` + `prompt.test.ts` | tests green, no network |
| 2 | `openrouter.ts` + `openrouter.test.ts` (mocked) | every row of the §4 error table tested; empty `data`; cost read from `usage.cost` |
| 3 | **MVP:** one manual shot → `generateImage` → `compose` → 1080×1350 PNG | one real paid image on disk, dims asserted, real cost logged |
| 4 | `brief.ts` (`chatJson`, JSON schema + zod, retry-once) | valid `brief.json` from `business.yaml` |
| 5 | `index.ts` module + registry + boundary-test update + `pipeline.test.ts` | `creative.generate` end-to-end with mocks |
| 6 | Carousel cards | 2–10 consistent 1080×1080 cards |
| 7 | `creative.stage_for_meta` → upload + paused ad + approval | paused ad visible in Ads Manager after approval |
| 8 | `docs/guides/departments-quickstart.md` section + `.env.example` keys | new dev can run it from the docs |

New env keys:

```env
OPENROUTER_API_KEY=            # https://openrouter.ai/keys — never commit
OPENROUTER_TEXT_MODEL=         # must support structured_outputs, e.g. a DeepSeek slug
OPENROUTER_IMAGE_MODEL=google/gemini-2.5-flash-image
CREATIVE_IMAGE_EST_USD=0.04    # pre-flight estimate only; real cost comes from usage.cost
```

Existing, unchanged: `DEEPSEEK_API_KEY`/`DEEPSEEK_MODEL` (rest of the repo), Meta ads credentials.

**Acceptance (real run):** `creative.generate` with 2 concepts × `feed_portrait` produces
2 PNGs at exactly 1080×1350 with correctly spelled overlay text, a manifest with real
OpenRouter costs under the cap, and `pnpm test` stays green.
