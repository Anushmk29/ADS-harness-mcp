# How to test the harness (Meta only)

Run everything from `D:\claued code\ADS-harness-mcp` in a terminal. It takes about 2 minutes. It adds no budget and switches nothing on.

## 1. See every tool

```
node --env-file=.env scripts/list-tools.mjs ads
node --env-file=.env scripts/list-tools.mjs analytics
```

The ads server has 139 tools and the analytics server has 57. Google Ads and GA4 tools are on the list but aren't tested here.

## 2. Run the feature test

```
node --env-file=.env scripts/feature-test.mjs
```

Each check prints PASS or FAIL. The full results go to `reports/feature-test-<date>/summary.md` and `results.json`.

The script starts three harness connections:

| Connection | Settings | What it runs |
|---|---|---|
| live | the real `config/ads-module.yaml` | reads, analysis, knowledge, safety |
| dry | a temporary dry-run copy of the same file | every write tool |
| analytics | the analytics server | the shared knowledge check |

The dry-run copy is deleted when the script ends.

## 3. What each section tests

1. **Meta reads.** These run live on act_2087398631820901:
   - accounts;
   - list and get for campaigns, ad sets, ads, creatives, audiences and labels;
   - pixels, the Instagram account, lead forms and budget schedules;
   - insights at account, campaign, ad set and ad level, plus daily rows, age and gender, and placements;
   - all 4 targeting searches.
2. **Meta planning.** A readiness check. Then it validates `drafts/engagement-2-0.json` and prepares a paused launch with its approval brief. Nothing is sent to Meta.
3. **Meta writes (dry-run).** Every create, update, delete and upload tool runs once: campaign, ad set, ad, creative, audience, label, image, video, conversion event, budget schedule, Page post, lead form and test lead. Each one must come back `DRY_RUN`, meaning the harness checked it and stopped before Meta.
4. **Analysis and optimisation:**
   - creative fatigue, once with too little data and once with mature data;
   - blended ROAS comparison, and refusal of mixed currencies;
   - measurement reconciliation;
   - a saved recommendation;
   - read-only monitoring, both scheduled and run now;
   - saved records, the approval history and the department skill.
5. **Marketing knowledge.** The knowledge router plus all 13 playbook files. It checks that `../.env` can't be read through it, then runs the learnings memory (list and retro).
6. **Safety.** Each of these is sent to the live settings and must be refused:
   - switching on a campaign or an ad through the API;
   - numeric statuses;
   - a budget above the ₹500 cap, a bid above the cap, or a negative budget;
   - multiplier budget schedules;
   - special ad categories;
   - deprecated placements and attribution windows;
   - tokens inside arguments;
   - accounts outside the allowlist, for reads and writes;
   - Page posts, conversion events, audience uploads and budget schedules on objects that aren't allowlisted;
   - a write with no operationId;
   - unknown argument keys;
   - a launch without READY readiness, and continuing a launch that doesn't exist.

   At the end it checks that the approval queue is still empty and that Engagement 2.0 is still PAUSED at the same budget.
7. **Decode (format research).** It starts runs for your own ads and for competitor ads. With no DeepSeek, OpenRouter or Apify key in `.env`, both must refuse to start. It also checks that bad input is rejected.

## 4. Offline unit tests (optional)

```
npx vitest run tests/decode tests/ads
```

There are 48 tests in 8 files. They use a mock Meta and cover these paths, which the live test deliberately doesn't run:
- the approval lifecycle: draft → pending → approved → sent;
- continuing a partial launch;
- the Decode format sorter.

## 5. Check the dashboard yourself

```
node --env-file=.env bin/cli.js dashboard
```

On **Approvals**, the queue should be empty; nothing from the test reached it. On **Inside → Decode**, a run shows the missing-key message.

## Results on 19 Nov 2026

**First run: 119 of 121 checks passed and 3 were skipped.** Two Page-level reads failed with Meta #190.

**After the Page token fix in `src/modules/ads/transport.ts`: 122 of 123 passed and 2 were skipped.**
- The one failure is Leads. It needs the `leads_retrieval` permission on the token.
- The skips are audiences (the account has none) and catalog/business reads (they need `business_management` on the token).

**After the new token (with `leads_retrieval` and `business_management`), and with the account list now returning the business ID: 130 of 130 passed and 1 was skipped.** The skip is audiences: the account has none to read.
