# PPC Math & A/B Test Design

Always show the formula and the plugged-in numbers. Round sensibly. State assumptions.

## Core formulas
- **CPA** = Spend / Conversions
- **CVR** = Conversions / Clicks
- **CPC** = Spend / Clicks
- **CTR** = Clicks / Impressions
- **CPM** = Spend / Impressions x 1000
- **ROAS** = Revenue / Spend
- **Break-even ROAS** = 1 / Gross margin %  (e.g. 60% margin -> 1/0.6 = 1.67x)
- **Max profitable CPA** = AOV or LTV x Gross margin %
- **LTV** = ARPA x Gross margin % x Average customer lifespan (months/years)
- **LTV:CAC** - healthy SaaS target >= 3:1; CAC payback target < 12 months
- **CAC** = (Ad spend + sales/mktg cost) / New customers
- **MER** (blended) = Total revenue (or new ARR) / Total ad spend
- **Blended CPA** = Total spend across channels / Total conversions

## SaaS pipeline math (why front-end CPA lies)
Trial CPA alone is misleading. Chain it:
`Cost per paid customer = Trial CPA / (trial->paid rate)`
Example: $40 trial CPA, 12% trial->paid -> $333 per paying customer. Compare that to
LTV, not to the $40. Same logic for lead gen: `Cost per SQL = Lead CPA / (lead->SQL rate)`.

## Budget forecasting
`Conversions = Budget / CPA`  ;  `Budget needed = Target conversions x CPA`
To exit Meta learning: ad set needs ~50 optimization-event conversions in 7 days, so
`min daily budget ~= (50 x CPA) / 7`. Below that, expect "Learning Limited".

## A/B test design
1. **Hypothesis**: "Changing X will improve [metric] because [reason]."
2. **One variable** only (hook OR audience OR landing page - not several).
3. **Primary metric**: usually CVR or CPA (not CTR alone).
4. **Sample size (rule of thumb)**: you need roughly enough conversions to detect the
   effect. For a ~20% relative lift on a ~3% CVR you need on the order of ~1,000+
   clicks per variant; smaller effects need far more. For quick directional reads use
   Meta/Google built-in Experiments which compute significance for you.
5. **Duration**: run >= 1-2 full business cycles (>=7-14 days), never end mid-learning,
   avoid calling a winner before ~95% confidence.
6. **Decision**: keep winner, document the learning, feed it into the next test. One
   clean test per change beats many noisy ones.

## Quick reference targets (SaaS)
- LTV:CAC >= 3:1, CAC payback < 12 months, pipeline ROAS ramping 3:1 -> 5:1.
- Google QS weighted >= 7; Meta EMQ >= 8.5 for the key event.
