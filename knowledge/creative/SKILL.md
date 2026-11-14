---
name: marketing-harness
description: >-
  Master skill for paid ad creative in a marketing harness. Runs static ads,
  video ads, carousel ads and ad copy through one format-first pipeline: scan
  which ad formats are winning right now, pick a format, pick a framework that
  fits it, write the hooks and copy, build the visual with a layout that
  differs from the last few, then pass a gate and log the result. Use for any
  request to make an ad, ad creative, ad image, video ad script, ad hook or ad
  copy, or to find out which ad formats are trending.
---

# Marketing Harness: ad creative

One skill for paid ad creative and ad copy. It merges the skills listed in the
Source index and adds one layer none of them had: **format intelligence**.

## The idea this skill is built on

A skill handed to an AI makes the AI repeat itself. Give it one ad template
and every ad has the same layout. Give it one copy framework and every ad has
the same shape. Two things fix that.

1. **Format comes before framework.** An ad's stopping power is set by its
   *format* (the container: statement headline plus product shot; before/after
   pair; founder photo plus claim; UGC-style screenshot; meme cold-open video).
   The *framework* (PAS, BAB, AIDA, FAB, 4Us) is the logic that goes inside it.
   Frameworks are stable. Formats decay in weeks. So the harness researches
   formats continuously and treats frameworks as a fixed toolbox.
2. **Layout is sampled, not remembered.** Every visual gets a Layout DNA drawn
   from a library, with a ledger that forbids repeating recent choices.

```
0 BRIEF        who, product, offer, goal, placement, proof that is real
1 RADAR        scan which ad formats are winning now  -> format-library
2 FORMAT       pick 1 format (and 1 backup) from the library
3 FRAMEWORK    pick the logic that fits that format
4 COPY         hooks first (3 options), then body, then CTA
5 VISUAL       static / carousel / video ad with a sampled Layout DNA
6 GATE         copy rules + fact check + platform limits. Can veto.
7 LEDGER       log format, framework, layout, hook. Feeds step 1 and 5.
```

Do not skip or reorder. Step 1 may reuse a radar run under 14 days old.

---

## 1. Radar: which ad formats are working now

### What to capture per ad (the format fingerprint)

Never store just "this ad did well". Store the reusable shape:

| Field | Example |
|---|---|
| platform / type | meta / static ad; meta / video ad; meta / carousel ad; google / responsive search ad |
| source url, date seen | |
| run length, live variants | days running and number of variants (Ad Library) |
| **format name** | "statement headline plus product shot", "before/after pair", "meme cold-open then pitch" |
| **format beats** | for video: 0-2s hook, 2-3s cut, 3-20s pitch, CTA |
| hook type | number reveal, contrarian claim, pain question, offer-first |
| framework underneath | PAS, BAB, FAB... |
| visual DNA | ground, type style, grid, motif, card count |
| offer and CTA | |
| niche | so the format is only reused where it fits |

### Where the data comes from

- **Meta Ad Library** (public, free): search competitors and category keywords. An ad that has been live 60+ days is the proxy for a winner. Record format (static, carousel, video, UGC, founder), hook, offer, CTA, run length, number of variants running. The Decode tab does this scrape and sorting live.
- **Spyglass**: named by the team as the second ad source. Use it the same way (longest-running and most-duplicated ads per advertiser) and confirm what data it exposes before relying on it; the harness has not verified it.
- **Our own account**: the Decode tab's "My ads" mode plots our ads by spend against the metric the account measures.
- Group by format, not by brand. A format that several advertisers run for 60+ days is a real winner. Feed the results into `ad-creative` Mode 3 and Mode 4 (grounded batches and the creative strategy loop), with the account's own reviews and ad comments as the other inputs.

### Method

1. Build a **watchlist**: 15-30 advertisers per niche (competitors, adjacent
   niches). Update monthly.
2. Pull ads live in the last 30-60 days.
3. Keep the longest-running 10 percent. Watch or transcribe each video ad.
   Write the fingerprint.
4. **Cluster by format**, not by advertiser. A format is real when it appears in
   3 or more winners from different advertisers.
5. Write to `format-library.json` (schema in `format-library.starter.json`).
   Mark each format `rising`, `peak` or `fading`.
6. Report: top 5 formats, one example each, and what is dying.

### Limits, said plainly

- Run length is a proxy, not proof: some advertisers leave losing ads on.
  Prefer formats several advertisers keep running.
- A trending format is a hypothesis about your audience, not proof. Test it
  (step 7 closes that loop).

---

## 2. Format library

Starter list. These are shapes seen widely, **not verified as current**. Radar
decides which are live this month. Add, promote and retire entries.

### Static ad / image creative
- Statement headline plus product shot, before/after pair, mechanism ("prompt
  bar plus three steps"), founder photo plus claim, UGC-style screenshot,
  comparison table, poster/typographic, offer card.

### Video ad (Reels, Stories, feed video)
- **Meme cold open, hard cut to black, pitch.** 1-3s recognisable clip, ~1s
  black, then the offer. Pattern interrupt does the work.
- **Screen-record walkthrough** with on-screen text. Shows the mechanism.
- **Before / after split.**
- **Talking head plus kinetic captions.**
- **UGC testimonial** (real customer only).

### Carousel ad
- Numbered benefits, before/after, comparison, product-per-card, "how it
  works" in 3-5 steps.

Format entry shape:

```json
{
  "id": "static-statement-product",
  "platform": "meta",
  "type": "static_ad",
  "status": "rising",
  "beats": ["headline", "product shot", "offer + arrow"],
  "fits_frameworks": ["FAB", "4Us"],
  "fits_niches": ["b2b-automation"],
  "examples": ["<url>"],
  "last_seen": "2026-09-30",
  "notes": ""
}
```

---

## 3. Frameworks: the stable toolbox

Choose the framework *after* the format. A format constrains length and beats;
the framework fills them.

| Framework | Shape | Best inside |
|---|---|---|
| PAS | Problem, Agitate, Solution | meme cold-open video, pain-led statics |
| BAB | Before, After, Bridge | before/after, testimonials |
| AIDA | Attention, Interest, Desire, Action | landing pages, longer ads |
| 4Us | Urgent, Unique, Useful, Ultra-specific | headlines and hooks |
| FAB | Feature, Advantage, Benefit | product statics, carousel cards |
| WHW | The team's own framework. Define its steps here before use | |

Format to framework pairing (defaults, radar can override):

| Format | First choice | Second |
|---|---|---|
| Meme cold-open video | PAS | BAB |
| Screen-record walkthrough | Show-Explain-Result (FAB) | PAS |
| Static ad | FAB or 4Us | PAS |
| Comparison / before-after | BAB | contrarian hook |

Full formula text: `sources/copywriting/references/copy-formulas.md`,
`headline-templates.md`, `cta-patterns.md`, `power-words.md`.

---

## 4. Ad copy

1. **Hook first, three options** of different types: one safe, one sharp, one
   that might fail. Say which you would run. Video ads live or die in the
   first 2 seconds.
2. Hook rules that outrank the libraries: one idea per hook; line 2 pays off
   line 1; numbers beat adjectives; if it works under anyone else's name it is
   not the hook.
3. **Video ad script layout:** timecoded beats, spoken line, on-screen text,
   visual/cut note. Match the format's beats exactly.
4. One CTA per ad. Specific over vague. Read aloud; if awkward, rewrite.
5. **Borrow the layout, never the words.** A reference supplies composition,
   not message.
6. **Every line must name something the product actually does.** If it could
   belong to any product it is filler.
7. **Never invent proof.** No made-up client, number, testimonial or result.
   Unknown numbers become `{{your number}}`.
8. Banned filler: revolutionary, seamless, game-changing, unlock, supercharge,
   effortless.
9. Character limits (Meta primary text, headline, RSA headlines and
   descriptions) are in `ads/creative-and-copy.md`. The validate tools
   enforce them.

---

## 5. Visuals: static, carousel and video ads

### Research before you draw
Look at how winning ads in this niche are built (radar). Look at the format's
recurring anatomy. Say what the research changed.

### Anti-sameness engine

Every visual gets a **Layout DNA**, one value per axis:

| Axis | Options (extend freely) |
|---|---|
| Ground | light paper / dark / photo / gradient / colour block |
| Type | condensed caps / editorial serif / rounded sans / mono |
| Grid | centred / split 46-54 / left-aligned column / full-bleed photo / card-on-field |
| Motif | hexagon / asterisk / sticker shadow / ghost numeral / frame line / none |
| Cover anatomy | question / giant number / photo + claim / diagram |

Rules:
1. Read `layout-ledger.json`. **A new ad may not repeat the ground + grid +
   cover-anatomy combination of any of the last 5.** Change at least 3 axes
   from the previous ad.
2. Pick from the current radar's winning visual DNA for that niche when
   available. Otherwise sample at random from unused combinations.
3. Within one carousel ad, **hold the grid across all cards** so the set reads
   as a set. Vary between ads, not within one.
4. A recurring motif in a reference is its author's identity. Borrow its
   position and role, replace the shape with the brand's own.

### Ad creatives
- Match reference: light centred headline-led, dark product-led, or
  before/after comparison.
- Headline sizes about 44-70 depending on template.
- The product name is a call to action, not a decal. Put the offer and an
  arrow in clear space below the hero.
- Incidental text inside artwork adds a second fact, never restates the
  headline.
- Sentence case, no exclamation marks.
- Sizes and safe zones: feed 1080x1350 (4:5), square 1080x1080, Stories/Reels
  1080x1920 with text kept out of the top 14% and bottom 35%.

### Carousel ads
- Card 1 is the hook; each card carries one point; the last card is the ask.
- 2 to 10 cards. Keep text large: a 1080 card shows at about a third of that
  in the feed.

### Image generation
- Prompt craft: `sources/ai-artist/references/image-prompting.md`.
- Real photography is sourced, not drawn, when the creative needs an object;
  drawn objects are what reads as AI.
- The image must show what the ad is about, not a mood standing in for it.
- The harness's creative module draws no text into images; copy is overlaid
  so spelling and character limits are exact.

---

## 6. Gate: nothing ships unchecked

1. **Fact gate.** Every claim traces to a real source. No invented proof.
2. **AI-tell check.** Ask "what makes this obviously AI generated?", answer in
   bullets, revise once.
3. **Copy checks:** one CTA, specific over vague, contractions, no stacked
   devices (one contrast, one triple, one reveal).
4. **Platform checks:** character limits and placements pass
   `meta_ads_validate_campaign` / `google_ads_validate_search_campaign`.
5. **Layout check:** ledger rule from section 5.

The skill drafts. A human approves; ads are created paused.

---

## 7. Ledger and learning loop

After each ad, append to `layout-ledger.json`:

```json
{
  "date": "2026-09-30",
  "piece": "static_ad | video_ad | carousel_ad",
  "format_id": "static-statement-product",
  "framework": "FAB",
  "hook_type": "Number Reveal",
  "layout_dna": {"ground": "dark", "type": "mono", "grid": "split-46-54", "motif": "ghost numeral", "cover": "giant number"},
  "ad_id": "",
  "results_7d": {"spend": null, "ctr": null, "cpl": null, "leads": null}
}
```

Fill `results_7d` a week later from the ad account. Then: which format +
framework pairs beat the account's own median cost per lead? Promote them in
the library; retire what flops twice. Record the finding with
`skill_learnings`.

---

## Source index

Full original skills are copied under `sources/`. Read the file named here
when a task needs the detail.

| Job | Source folder | Key files |
|---|---|---|
| Copy formulas, headlines, CTAs, landing copy | `copywriting` | `references/*`, `templates/copy-brief.md` |
| Paid ads: copy templates, targeting, optimisation, specs | `ads-management` | `references/*` |
| Image prompting | `ai-artist` | `references/image-prompting.md`, `nano-banana.md` |
| Ad creatives and paid ads | `marketing-skills` | `ad-creative.md`, `ads.md` |
| Copy and copy editing | `marketing-skills` | `copywriting-and-copy-editing.md` |
| Psychology, offers, A/B testing, CRO | `marketing-skills` | `strategy-psychology-offers-cro.md` |

Distilled into this file from a private ad production skill: ad copy rules and
inspiration reading. Its raw file is not included because it carries one
company's brand data.
