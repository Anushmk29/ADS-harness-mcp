# Decode: live format research for organic content and ads

Implemented on 2026-10-01 and 2026-10-02. The design copies the "Decode the Invo deal" dashboard from a Jev reel. Decode collects a set of posts or ads and sorts each one into a repeatable **format** (for ads, an **angle**). It splits each item's copy and spoken script into beats, then plots every item on a live chart, so you can see which formats win.

## Status

| Source | Path | Verified |
|---|---|---|
| Instagram / TikTok posts | Apify scrape → DeepSeek | Not run live: `APIFY_TOKEN` is not set. The actor ids and their inputs come from the common public actors and have not been checked. |
| Competitor ads (Meta Ad Library) | Apify scrape → DeepSeek | Not run live, for the same reason. |
| Our own Meta ads | Ads module read tools → DeepSeek | A live read of `act_2245143739365491` ("jai", INR) succeeded and returned **0 ads**. The account has a paused campaign, ad set and creatives but no ad objects; see [namostri-awareness-draft.md](../campaigns/namostri-awareness-draft.md). |
| Spoken-word transcripts | ffmpeg → Groq / OpenAI / local faster-whisper | The local faster-whisper path ran on a real 38 s reel: accurate timestamps, about 10 s, $0. The Groq and OpenAI paths have not run live. |
| Dashboard | `Decode` tab | Checked in headless Chromium at 1440 px and 390 px with simulated events. |

All of it is covered by `tests/decode/decode.test.ts`, which injects fake Apify, DeepSeek, ads and transcriber responses. At the time of writing the full suite passes: 96 tests.

## Using it

Open the dashboard (`pnpm run dashboard`) and choose the **Decode** tab.

| Mode | Input | Chart x | Chart y |
|---|---|---|---|
| Organic → Instagram / TikTok | `#hashtag`, `@handle`, keyword or profile URL | views | likes |
| Ads → Competitors | brand, keyword or Ad Library URL | days running | live variants |
| Ads → My ads | ad account id; leave blank to use the first allowlisted account; window of 7/30/90 days | spend | ROAS, else leads, else CTR % |

For own ads, the y-axis is the first metric the account actually records: purchase value gives ROAS; otherwise lead actions give leads; otherwise CTR. Meta reports overlapping action types, such as `omni_purchase` and `purchase`, so the first one found is used and they are never summed.

For competitor ads, days running stands in for "it works", because the Ad Library publishes no spend or results.

### What the screen shows

- **KPI strip**: items decoded / total, creators (or advertisers, or ads), items sorted into a format, median x, and the estimated AI cost. They count up as each item lands.
- **Performance map**: a log-scale scatter with a median line and a least-squares trend line.
  - Each new thumbnail flies in from the left and lands at its position.
  - Older points shrink and grey out into a cloud.
  - The newest point (or one you click) is outlined.
  - Clicking a format row dims the items outside that format.
- **Top items**: the 24 highest items by x.
- **Inside the item**: handle, date, format, link (the original post, or Ads Manager for own ads), hook, stats, "× the median", a coloured anatomy bar and the beats. Beats that come from speech show their `m:ss` timestamp.
- **Which formats win?**: formats (or creators) ranked by median x, with item count and ratio to the run median.
- **Brief this →**: saves a content artifact (`channel: paid` for ads, `organic` otherwise). It contains the format description and the top five hooks with links. It is saved with `requestApproval: false`; send it for approval from the content pipeline.
- **Previous runs**: reopens any saved run.
- **Stop**: ends the run after the current batch.

## Configuration

| Variable | Needed for | Default |
|---|---|---|
| `APIFY_TOKEN` | Instagram, TikTok and Ad Library scraping | none; those runs refuse to start without it |
| `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` | every run (classification) | already set |
| `ADS_DIRECT_META_ACCESS_TOKEN` + `config/ads-module.yaml` `accounts.meta` | own-ads runs | already set |
| `GROQ_API_KEY` | faster, paid transcription (whisper-large-v3, about $0.111/audio hour) | unset |
| `OPENAI_API_KEY` | transcription fallback (whisper-1, about $0.36/audio hour) | unset |
| `DECODE_TRANSCRIBE` | force `groq`, `openai`, or `off` | auto |
| `DECODE_WHISPER_MODEL` | local faster-whisper model | `base` |
| `DECODE_PYTHON`, `DECODE_FFMPEG` | binary overrides | `python` on Windows, `python3` elsewhere; `ffmpeg` |
| `DECODE_USD_PER_M_INPUT`, `DECODE_USD_PER_M_OUTPUT` | DeepSeek price per million tokens for the cost tile | `0.28`, `0.42` (unverified; set these from your bill) |

The AI-cost tile is an **estimate**. It adds DeepSeek token usage at the configured prices to paid transcription minutes. Local transcription counts as $0.

## How a run works

1. `POST /api/decode/runs` validates the input and returns `202` with the run summary immediately.
2. **Collect.**
   - Scrape runs: Apify `run-sync-get-dataset-items` returns the items. Anything that can't be plotted is dropped (for example, Instagram image posts with no views).
   - Own-ads runs: `meta_ads_list_ad` and `meta_ads_insights` (`level: ad`, `timeIncrement: all_days`) run through the ads module. The account allowlist and read-only tools apply exactly as elsewhere.
3. **Batches of 10.** Each batch does the following:
   1. **Transcribe**, if enabled and the item has a video URL. ffmpeg pulls up to 90 s of mono 16 kHz audio straight from the URL. Items whose audio fails stay caption-only. A transcriber that fails once is not retried for the rest of the run.
   2. **Classify.** One DeepSeek `json_object` call per batch. The prompt carries the current format list, so formats stay consistent across batches (12 at most). Scraped text is passed as data, never as instructions.
   3. **Stream.** Each item is broadcast as an SSE `decode` event on `/api/events/stream`. The browser queues items and shows one every 160 ms, so a batch lands as ten separate fly-ins.
   4. **Save.** The run is written to `.marketing-data/decode/<runId>.json`.
4. A final `run` event reports `done`, `stopped` or `error`.

### API

| Method | Path | Body / result |
|---|---|---|
| `GET` | `/api/decode/runs` | `{ runs }`: summaries, newest first |
| `POST` | `/api/decode/runs` | `{ mode: 'organic'\|'ads', platform?: 'instagram'\|'tiktok'\|'meta_ads'\|'own_meta', query, limit?: 5–200 (60), days?: 1–365 (30), transcribe?: boolean (true) }` → `202 { run }` |
| `GET` | `/api/decode/runs/:id` | `{ run }` with items, or `404` |
| `POST` | `/api/decode/runs/:id/stop` | `{ stopping: boolean }` |

These sit behind the same API auth as every other `/api/` route.

SSE `decode` events:

- `{ type: 'run', run }`: status changes.
- `{ type: 'item', runId, item, decoded, costUsd, transcribed, formats }`: each decoded item.

## Files

| File | Role |
|---|---|
| `src/modules/decode/index.ts` | `DecodeService`, Apify input builders and normalizers, own-ads normalizer, DeepSeek classifier, run storage |
| `src/modules/decode/transcribe.ts` | audio extraction and the Groq / OpenAI / local faster-whisper transcribers |
| `src/server/server.ts` | constructs the service, passes in the ads read path, adds the `/api/decode/*` routes |
| `public/js/views/decode-view.js` | the Decode tab (chart, animations, panels, brief button) |
| `public/css/dashboard.css` | `#view-decode` paper theme (scoped; the rest of the dashboard is unchanged) |
| `public/index.html`, `public/js/app.js` | tab, fonts (Inter Tight, JetBrains Mono), SSE hookup |
| `tests/decode/decode.test.ts` | normalizers, own-ads metric choice, transcript formatting, end-to-end scrape and own-ads runs |
| `tests/server/frontend.test.ts` | now expects three view panels |

`src/modules/decode` imports neither `ads` nor `content`; the existing `module-boundaries` test still holds. Own-ads reads are injected by the server.

## Known gaps

- **Own ads are not transcribed.** No ads-module read tool returns a creative's video source URL. Adding one is the next step.
- **Apify actors are unverified.** On the first real run, check `ACTORS` and `actorInput()` in `index.ts` against the actors' current input schemas. TikTok video URLs depend on `shouldDownloadVideos`.
- **Scraped CDN links expire.** Instagram and TikTok thumbnail and video URLs expire after some hours. Reopened old runs fall back to letter tiles, and their videos can no longer be transcribed.
- **Local transcription runs on CPU.** It is roughly 30–60 s per batch of ten videos. Set `GROQ_API_KEY` for speed.
- **Sync scraping is capped.** Apify's sync endpoint times out at 5 minutes, which caps large scrapes. Runs are limited to 200 items.
- **Interrupted runs stay "running".** Runs live in memory while active. A server restart mid-run leaves its saved file in `scraping` or `decoding` with no way to resume.
