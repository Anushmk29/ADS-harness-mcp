# Claude Code Prompt: Build the Creative Module

Copy everything below the line and paste it into Claude Code, opened in the
`marketing-harness` repo root.

---

You are adding an **ad creative module** to this existing TypeScript repo
(marketing-harness: pnpm, vitest, zod, sharp). The full spec is in
`docs/plans/creative-pipeline-build-brief.md`. Read it completely before writing code.

## Goal

A new module `src/modules/creative/` with two capabilities:

- `creative.generate` — `business.yaml` brand + campaign params → OpenRouter chat
  (JSON-schema brief) → OpenRouter images (background only) → sharp crop to exact Meta
  sizes + SVG text overlay → `runs/creative/{runId}/…png` + `manifest.json`
- `creative.stage_for_meta` — upload chosen assets via the ads module's
  `meta_ads_upload_image`, then create a **paused** ad through the existing launch +
  HITL approval flow

**All generation (text and images) goes through OpenRouter with `OPENROUTER_API_KEY`.**

## Read these first (existing code you must reuse, not reimplement)

- `src/core/modules/contracts.ts`, `src/core/modules/registry.ts` — module contract + registration
- `src/modules/content/index.ts` — a module implementation to mirror
- `src/modules/content/slides.ts` — SVG text + sharp rendering technique for the overlay
- `src/modules/decode/index.ts` → `classifyBatch` — the plain-`fetch` + injectable
  `fetchImpl` + zod-parse + `costUsd` pattern to copy for `openrouter.ts`
- `src/modules/ads/tools.ts` (`meta_ads_upload_image`) and `src/modules/ads/planning.ts`
  (paused Meta hierarchy with `creative.imageHash`)
- `tests/core/module-boundaries.test.ts` — module import rules
- `config/business.yaml` → `brand` block

## Hard rules

1. **TypeScript only, inside this repo.** No Python, no new project folder, no vendored
   `skills/` copy, no OpenRouter/OpenAI SDK — plain `fetch`. The global skills
   (`ads-create`, `banana`, …) are reference reading for writing prompts only.
2. **One network client:** `openrouter.ts` exports `chatJson()` and `generateImage()`.
   Nothing else in the module calls `fetch`.
3. **Endpoints** (base `https://openrouter.ai/api/v1`, `Authorization: Bearer $OPENROUTER_API_KEY`):
   - Brief: `POST /chat/completions`, `model: $OPENROUTER_TEXT_MODEL`,
     `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }`,
     `provider: { require_parameters: true }`. Zod-parse the content anyway; retry once
     on validation errors.
   - Images: `POST /images` with `{ model: $OPENROUTER_IMAGE_MODEL, prompt, n: 1,
     aspect_ratio, resolution: '2K', output_format: 'png' }` → `data[0].b64_json`,
     `usage.cost`. Empty `data` → `ImageBlockedError`; non-raster `media_type` → reject.
   - Model ids come from env only. Before the first paid call, confirm on
     openrouter.ai/models that the image model exists, its price, and that the text
     model supports `structured_outputs`.
4. **Errors** (body `{ error: { code, message, metadata } }`): 400/401 no retry;
   **402 out of credits → stop the whole run**; 403 moderation → `ContentBlockedError`
   with `metadata.reasons`, record in `failed[]`, no retry; 429 → honor `Retry-After`,
   else backoff; 502/503 → exponential backoff with jitter, max 3. 120s timeout on every
   call. Missing key → clear error linking https://openrouter.ai/keys.
5. **The image model never draws text.** Every image prompt ends with
   "no text, no letters, no words". Headlines/CTAs are rendered by `compose.ts` as SVG.
6. **Raw user text never reaches the image model.** Prompts come from the pure function
   `buildPrompt(shot, brand)` using zod-validated `shot` fields
   (subject, action, context, composition, style) + brand visual fields.
7. **Strip banned prompt words** (case-insensitive, log them): 8K, 4K, ultra HD, high
   resolution, masterpiece, best quality, ultra-realistic, hyperrealistic, trending on
   artstation, highly detailed, ultra detailed, award winning.
8. **Exact output sizes** via `sharp.resize(w, h, { fit: 'cover' })`: 4:5 → 1080×1350
   (primary, do first), 1:1 → 1080×1080, 9:16 → 1080×1920, carousel cards 1:1. If a
   model rejects a ratio, fall back to the nearest one (4:5 → 3:4) and let the crop fix
   it. Assert output metadata. Keep overlay text out of the 9:16 safe zone (`specs.ts`).
9. **Text limits enforced in zod**, not prose: overlay ≤25 chars, ≤3 phrases; headline
   ≤40; primary text ≤125; carousel description ≤20; carousel 2–10 cards. Reject copy
   containing `brand.bannedPhrases`.
10. **Module boundaries:** `creative` imports neither `ads` nor `content`. Add
    `'creative'` to `ModuleId`, register it, extend the boundary test. If you need
    `wrap()`/`esc()` from `slides.ts`, move them to a shared file — don't copy.
11. **Money safety:** `maxCostUsd` input with a default. Pre-flight estimate with
    `CREATIVE_IMAGE_EST_USD`; refuse if over. During the run, sum real `usage.cost` and
    stop at the cap. Generation never creates live ads; `stage_for_meta` only creates
    **paused** objects behind existing approval.
12. **Failures don't abort the run** (except 401/402): a blocked/failed image goes to
    `manifest.failed[]`.
13. **Tests use mocked fetch** (no network in `pnpm test`): `prompt.test.ts`,
    `openrouter.test.ts` (each error status, `Retry-After`, empty `data`, cost),
    `pipeline.test.ts` (mocked OpenRouter → manifest + exact dimensions).
14. **Do not build** (see brief §9): brand-DNA-from-URL, Playwright screenshots, AI
    quality scoring, multi-provider fallbacks, streaming, an MCP server config,
    `~/.banana/costs.json`.

## Build order (stop and show me after step 3)

1. `specs.ts` + `prompt.ts` + `prompt.test.ts`
2. `openrouter.ts` + `openrouter.test.ts`
3. **MVP:** one hand-written shot → `generateImage` → `compose` → a single 1080×1350 PNG
   with overlay text. This is one real paid call — **ask me before running it**, and tell
   me the image model id and the price you checked on OpenRouter.
4. `brief.ts` (`chatJson`, JSON schema + zod, retry once)
5. `index.ts` + registry + boundary test + `pipeline.test.ts`
6. Carousel cards
7. `creative.stage_for_meta` — **ask me before any Meta write**, even a paused one
8. Add a section to `docs/guides/departments-quickstart.md`; add `OPENROUTER_API_KEY`,
   `OPENROUTER_TEXT_MODEL`, `OPENROUTER_IMAGE_MODEL`, `CREATIVE_IMAGE_EST_USD` to `.env.example`

## Definition of done

- [ ] `pnpm test` green, including the extended module-boundary test
- [ ] `creative.generate` (2 concepts × feed_portrait) → 2 PNGs at exactly 1080×1350,
      overlay text spelled correctly, `manifest.json` with real OpenRouter costs under the cap
- [ ] blocked images appear in `manifest.failed[]` without aborting the run; 402 stops it
- [ ] `creative.stage_for_meta` creates a paused ad only after HITL approval
- [ ] no Python files, no SDKs, no vendored skills, no hardcoded keys or model ids

## First action

Read `docs/plans/creative-pipeline-build-brief.md` and the files listed above. Then reply with a short plan
(files you'll touch, the `brand.visual` block you'll add to `business.yaml`, the text and
image model slugs you propose) before writing code.
