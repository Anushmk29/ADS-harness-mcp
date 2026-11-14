# Competitor Ad Intelligence Playbook

## Process
1. Identify target competitors (from config/business.yaml and the our-business-fit topic or ask the user).
2. Pull live ads from free public libraries (below).
3. Analyze copy angles, creative, offers, messaging themes, estimated spend.
4. Build a gap map: what no competitor is doing = the user's opening.
5. Output COMPETITOR-INTEL.md + a prioritized "moves to make" list.

## Free intelligence sources (no login)
| Source | URL pattern | What you get |
|--------|-------------|--------------|
| Meta Ad Library | facebook.com/ads/library (search advertiser) | Every active FB/IG ad: creative, copy, run dates, placements |
| Google Ads Transparency Center | adstransparency.google.com (search advertiser/domain) | Active Google ads, formats, geos, history |
| Google Auction Insights | from the user's own Google account | Impression share, overlap rate, outranking share vs named competitors |

If live web access is available, fetch these directly. If not, give the user the exact
URLs to open and tell them what to screenshot/paste back.

## What to extract per competitor
**Ad copy**: headlines, primary value props, CTAs (trial/demo/buy), offers, tone, USPs,
the pain points they lead with.
**Creative**: formats (image/video/carousel), visual style (UGC vs polished vs product
screenshots), creative volume (= testing velocity), refresh frequency.
**Messaging themes** - score each competitor and the user:
| Theme | Comp A | Comp B | You |
|-------|--------|--------|-----|
| Price/Value | | | |
| Quality/Premium | | | |
| Speed/Ease | | | |
| Trust/Authority (proof, logos) | | | |
| Innovation/AI | | | |

**Keyword intel (Google)**: are they bidding your brand? shared non-brand terms?
terms they cover that you don't? Use Auction Insights for impression-share gaps.
**Spend estimate**: directional only - impressions x CPM / 1000, or Auction Insights +
your own CPCs. Meta Ad Library shows exact spend only for political/social ads.

## Gap & opportunity map
- **Platform gaps**: where are competitors absent or underspending?
- **Messaging gaps**: which pain points / value props is nobody claiming?
- **Audience gaps**: which roles, verticals, geos, or funnel stages are neglected?
- **Creative gaps**: formats/styles (UGC, founder video, comparison content) nobody uses.

## Competitive response rules
- If a competitor bids your brand: always run brand defense (cheap, high CTR), use
  sitelinks to pricing/reviews, emphasize your differentiator. Consider bidding their
  brand + "alternative" terms.
- If you're outspent: compete on efficiency, not volume - tighter targeting, better
  creative, long-tail keywords they ignore, and lean hard into retargeting.

## 2025-2026 things to check
- Meta **Andromeda** (Oct 2025) suppresses near-duplicate creative >60% similar -
  judge competitor creative on genuine concept diversity, not volume of variations.
- Google **Demand Gen** replaced Video Action Campaigns (Apr 2026) - check competitor
  Demand Gen / PMax / AI Max adoption in the Transparency Center.
