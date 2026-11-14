# Namostri awareness campaign draft

Status: partially created in Meta, 2026-09-24. Campaign `52549027430764` and ad set `52549028005564` are both provider-verified `PAUSED`. Both creatives now exist: Tyohaar `1776753783541576` and Roshni `1393157936129895`. No ad objects exist. Meta rejected the first ad-object creation, despite its `PAUSED` status, with subcode `1359188`: add a valid payment method in the ad account's billing centre. The account is active (`account_status: 1`) but its read response omits `funding_source`. No delivery or spend is possible from this incomplete paused hierarchy. The Facebook Page `Jai Golani` (ID `585872155264695`) is owned by Business `660422001056256`; system user `ad_bot` (`122099607099487181`) has the Page's `ADVERTISE` task, and the Page is published. The website remains the sole intended click destination, not the Meta ad identity.

The successful reviewed operations are `namostri_mp_awareness_20260924_tyohaar_image`, `namostri_mp_awareness_20260924_roshni_image`, `namostri_mp_awareness_20260924_campaign_v2`, `namostri_mp_awareness_20260924_adset_v5`, `namostri_mp_awareness_20260924_tyohaar_creative_v2`, and `namostri_mp_awareness_20260924_roshni_creative`. Earlier failed attempts remain in the journal as `FAILED` and were not recreated remotely. The first paused ad attempt also failed definitively for missing billing, so use a new operation ID after billing is fixed. The Tyohaar and Roshni image hashes are `97e9f778f975d9d8102ea0e33a17bfa2` and `a32c2aaf309a65bdb04fc530fe7e731c`. The module's default policy remains `dry-run`; these operations used an explicit one-off `review` session.

## Campaign and ad set

| Setting | Draft value |
|---|---|
| Ad account | `act_2245143739365491` (INR) |
| Visible Facebook Page | `Jai Golani` (`585872155264695`), confirmed by user; Page ad access still unverified |
| Campaign objective | `OUTCOME_AWARENESS` |
| Campaign name | `Namostri | MP Women 25-38 | Awareness | Festive 2026` (Meta ID `52549027430764`) |
| Status | `PAUSED` until separately activated |
| Budget placement | One ad set (`52549028005564`) with ₹200/day = `daily_budget: 20000` in Meta's minor INR units |
| Optimization / billing | Reach / impressions, subject to live API eligibility check |
| Location | Madhya Pradesh, India; Meta region key `1753`, verified by a live `adgeolocation` lookup |
| Age and gender | 25–38, women (`age_min:25`, `age_max:38`, `genders:[2]`) |
| Interests | Provider-verified ad set uses `Online shopping (retail)` ID `6003346592981` and `Women's clothing brands (clothing)` ID `6861863500415`. The originally selected `Anarkali Salwar Suit` and a later `Shalwar kameez` result were both rejected as deprecated. The final audience explicitly sets `targeting_automation.advantage_audience: 0`; Meta still may treat interests as an OR set. |
| Destination | `https://www.namostri.com/` only |
| Placements | Facebook feed placements compatible with 1080×1350 images. No connected Instagram identity has been found; do not include Instagram, Stories or Reels without one and placement-specific creative review. |

The account also returned `Fabindia` ID `6004160937695` and `Myntra` ID `6009335700809` as possible interests. They are not in the first ad set because the user asked for Namostri, not competitor-branded creative or unnecessary extra filters. Do not substitute a guessed interest when the API returns no exact match.

At ₹200/day and an awareness objective, use reach, frequency, CPM, and website clicks as diagnostics; this campaign is not configured to optimize for purchases. This draft uses one ad set and two ads so the daily budget is not accidentally doubled.

## Ads

Both ads use `https://www.namostri.com/` as their only click destination. The homepage presents Namostri ethnic wear, including suit sets and kurtas. It did not expose “Tyohaar” or “Roshni” text in the page content inspected on 2026-09-24, so avoid promising a collection page that the click will not open.

| Ad | Source asset | Draft primary text | Headline | CTA |
|---|---|---|---|---|
| Tyohaar | `C:/Users/ABC/Downloads/70_fd_X_1080x1350.png` | `Festive moments call for something special. Explore Namostri's ethnic wear collection.` | `Discover Namostri` | `LEARN_MORE` |
| Roshni | `C:/Users/ABC/Downloads/71_fd_X_1080x1350.png` | `Find your festive look at Namostri. Explore elegant ethnic wear for every celebration.` | `Explore Festive Styles` | `LEARN_MORE` |

The supplied images are both 1080×1350 feed creatives. They already contain a visible “EXPLORE” prompt. The proposed text adds context without making unverified fabric, price, stock, delivery or discount claims. Confirm that Namostri owns or is licensed to use both images and models.

## Before creating the full paused hierarchy

1. Add a valid payment method in the billing centre for ad account `act_2245143739365491`. Do not share card details or payment credentials in chat.
2. Create the two ads under ad set `52549028005564` using the existing creative IDs, both `PAUSED`, under `review` mode. Use a new operation ID for the Tyohaar ad because the prior provider response was a definite validation failure.
3. Verify both ads' creative links are exactly `https://www.namostri.com/`, their Page identity and `PAUSED` delivery. Activation is separate.
