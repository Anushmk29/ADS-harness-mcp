# Diagnose: find the cause before proposing a fix

Use this when something got worse: cost per lead spiked, lead quality dropped, bookings fell, or a content series went flat.
The output is a confirmed cause, then a proposal through the normal tools (`ads_create_recommendation` for ads). It is never a direct change.

## 0. Make the question exact
Turn vague words into a metric, a period and a comparison before doing anything else.

| They say | Ask or pin down |
|---|---|
| "Ads aren't working" | Which number: cost per lead, cost per qualified lead, booked calls? For which campaign, over which dates, compared with what? |
| "Leads are bad" | Bad how: wrong business type, no budget, no reply, fake numbers? How many out of how many? |
| "Content isn't landing" | Which pieces? Which metric is down compared with our own median (`skill_learnings` `retro`)? |
| "It dropped suddenly" | From what date? What changed that week: budget, creative, landing page, tracking, season? |

## 1. Enough evidence?
If there are **fewer than 30 data points** (leads, conversions, pieces) **or less than 30 days** of history, don't diagnose. Give a measurement plan instead:
- what to track;
- for how long;
- which number would confirm or rule out each suspect.

Record each suspect as a `hypothesis` with that plan as its `testPlan`.
Check tracking first (`ga4_tracking_audit`, `ads/meta-audit-checklist.md` tracking checks). Broken tracking causes many "drops".

## 2. Investigate
Read the account data (read tools only). List what changed:
- **Outside:** CPMs, competitors, season, holidays.
- **Inside:** budget edits, new or paused ads, audience edits, landing page, offer, form, follow-up speed.

## 3. Analyze
Check the reasoning traps:
- **Correlation:** did X actually cause it, or just happen at the same time?
- **Survivorship:** are we only looking at what's still running?
- **Effort is not output:** more posts or more spend isn't the goal.
- **Recency:** is one bad week being read as a trend?
- **Single cause:** is it really one thing?

## 4. Hypothesize, then STOP
Present the most likely cause in this block and wait:

> **Root cause to confirm:** <one sentence>
> **Evidence for:** <data, with refs>
> **Evidence against:** <data that doesn't fit>
> **If true, then:** <what we'd change>
> Reply **confirm**, **revise** or **reject**.

"Sure", "maybe" or silence is not a confirmation; ask again. Only an operator's explicit confirmation moves to step 5.

## 5. Recommend
- Propose the fix with the matching tool: `ads_create_recommendation`.
- Record the confirmed cause with `skill_learnings` `add`, with the evidence refs, so the next diagnosis starts from it.
- Pause and scale thresholds come from `ads/our-business-fit.md`, not from this page.
