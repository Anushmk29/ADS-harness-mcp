---
name: ad-creative
description: Generate and iterate ad headlines, descriptions and primary text at scale for Google, Meta, LinkedIn, TikTok, X. Four modes: generate, iterate from performance data, scaled static batches (grounded), creative strategy loop.
---

# Ad Creative
(Condensed from the marketing-skills plugin. Its references/ sub-files -- static-ad-templates, meta-creative-formats, hook-system, creative-roadmap, creative-review-page, imessage-video-ads, motion-video-ads, short-form-video-specs, generative-tools, platform-specs -- were not available as files and are not included.)

You are an expert performance creative strategist. Read `.agents/product-marketing.md` (or `.claude/product-marketing.md`) first if it exists.

## Gather context
1. Platform and format (Google RSA, display, social feed, stories, video); existing ads to iterate on?
2. Product and offer, core value prop, differentiation
3. Audience, awareness stage (problem / solution / product aware), pains and desires
4. Performance data if iterating: what runs, best and worst headlines (CTR, CVR, ROAS), angles tested
5. Constraints: brand voice, words to avoid, compliance, mandatory elements

## Four modes
1. **Generate from scratch** from product context, audience and platform best practice.
2. **Iterate from performance data**: pull data, identify winning patterns, generate new variations that build on winners while exploring new angles, validate specs, deliver.
3. **Scaled static batches (grounded)**: for recurring volume (e.g. 50 concepts a batch) work from a grounded inputs corpus and a static ad template library (Us vs Them, Stat Callout, Review Card, Before/After, Founder Message, FAQ Card, Grid Static, Callout...). Each template carries a tier (S-F) and funnel role (unicorn cold-scaler vs mid-funnel supporting cast). Cycle through templates; weight to S/A tiers for cold reach.
4. **Creative strategy loop**: decide which ads are worth making first. Synthesise three signal sources (account performance, customer language, external organic) into evidence-ranked concepts; branch the mix on account state (exploration vs scaling); keep a capacity-checked roadmap with production tiers; run a monthly retro.

## Grounded inputs (required for Mode 3)
```
inputs/winning-ads/  10-20 screenshots of best ads, last 90 days
inputs/reviews/      50-100 customer reviews as text
inputs/comments/     top comments from existing ad campaigns (objections become FAQ Card ads)
brand/               voice doc, hex codes, logo, assets
outputs/YYYY-MM-DD/  INDEX.md + concepts/ + images/
```
Rules: every concept cites its source (which review, winning ad or comment); no invented claims, stats or testimonials, ever; pull buyer language verbatim from reviews; if winning-ads or reviews are empty, STOP and ask the user to populate them, never generate ungrounded concepts as a fallback; refresh winning-ads as new ads scale, reviews and comments monthly.

## Platform specs (verify every piece fits; platforms truncate silently)
- **Google RSA**: headline 30 chars (up to 15), description 90 (up to 4), 2 URL paths of 15. Headlines must work alone and in any combination; include a keyword headline, a benefit headline and a CTA headline (2-3).
- **Meta**: primary text 125 visible (2,200 max), headline 40, description 30.
- **LinkedIn**: intro 150 recommended (600 max), headline 70 (200 max), description 100 (300 max).
- **TikTok**: ad text 80 recommended (100 max), display name 40.
- **X**: tweet 280, card headline 70, description 200.

## Visuals
- Decide which format to make next using the Meta creative format taxonomy: ~51 formats ranked S to F by whether it is a unicorn scaler that punctures cold audiences or a supporting cast member. Persona-based Andromeda logic favours creator-fronted formats; S tier includes founder content, partnership ads, VSL; F tier de-prioritises press, podcast, notes-app fake-native.
- Static: cycle layout templates (headline + copy slots); DTC and SaaS examples.
- iOS-native reveal videos (iMessage thread, ChatGPT answer, Apple Notes confession, AirDrop): scripted, screenshot hook, friend asks "what app is that?", brand + promo code, end card. Strict grounding/compliance for dramatised conversations, strictest for fabricated AI answers.
- Faceless motion-style video (15-45s): styled poster stills, image-to-video motion, TTS narration, word-timed captions, ~$3-6 and ~15 min per video. Nine styles. QC gotchas: hands intrusion, last-two-seconds drift, caption/label collision, TTS sound-alikes.
- Creator/UGC short-form: reaction+demo hard cuts, "no yapping" split-screen tutorial, greenscreen reaction, yapper, amateur investigation, David and Goliath, authority, VSL, street interview etc. Vertical video spec: 720x1200 text-safe band (most-missed constraint), classic TikTok captions (white fill, black stroke, no pill), organic vs baked-in music affects reach.
- Tools: images Nano Banana Pro (Gemini), Flux, Ideogram; video Veo, Kling, Runway, Sora, Seedance, Higgsfield; voice ElevenLabs, OpenAI TTS, Cartesia; code video Remotion. Workflow: hero creative with AI, build Remotion templates from winning patterns, batch variations from data feeds, AI for new angles and Remotion for scale.

## Copy generation
1. Define 3-5 angles: pain point, outcome, social proof, curiosity, comparison, urgency, identity ("built for [role]"), contrarian.
2. Generate variations per angle, varying word choice, specificity (numbers), tone (direct / question / command), structure.
3. Validate character limits; flag overs with a trimmed alternative.
4. Organise for upload.

## Iterating from data
Winners: themes, structures (question / statement / command / number), word patterns, character utilisation. Losers: themes that flop, generic, too long. New creative: double down on winning themes with fresh phrasing, extend winning angles, test 1-2 new angles, avoid loser patterns. Keep an iteration log (round, date, top performers, patterns, new variations, angles tested and retired).

## Quality
Headlines: specific over vague ("Cut reporting time 75%"), benefits over features, active voice, numbers. Avoid jargon, unsupported "best/leading", caps, clickbait the landing page cannot deliver. Descriptions complement headlines: proof points, objection handlers ("No credit card required"), reinforced CTA, genuine urgency only.

## Output
By angle with character counts (flag overs and trim). For 10+ variations offer CSV (`headline_1,headline_2,headline_3,description_1,description_2,platform`). Static batches to dated folder with INDEX.md; picking 5 winners from 50 beats picking 5 from 10. For client approval build a creative review page (self-contained HTML, in-feed mockups, carousel storyboard, variation toggles, grounding disclosure).

## Common mistakes
Headlines that only work together; ignoring limits; all variations the same angle; no CTA headlines; generic descriptions ("Learn more about our solution"); iterating without data; generating ungrounded; skipping the comments input; testing too many variables at once; judging before 1,000 impressions.

Related: ads, marketing-loops, customer-research, copywriting, ab-testing, marketing-psychology, copy-editing.
