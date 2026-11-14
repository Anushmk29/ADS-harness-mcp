# DeepSeek ads command workflow

## Status

Implemented locally through the Meta rollout gate; authenticated Meta verification is required before the high-level Google creation phase is enabled.

## Goal

Turn an operator's natural-language request into a validated Meta Ads, Google Ads, or GA4 operation using the existing DeepSeek Harness.

## Trigger

An operator sends DeepSeek a natural-language request describing the advertising or measurement outcome they want.

## Current sequence

1. DeepSeek identifies the requested provider and operation.
2. It discovers the exact department capability and input schema.
3. It reads stored business context, provider readiness, capability status, and relevant campaign data.
4. It reuses verified stored defaults and asks only for unresolved blocking or high-risk inputs: budget, objective, destination, audience/geography, conversion goal, creative approval, and activation timing.
5. It validates the proposed operation.
6. DeepSeek presents a decision-ready approval brief for the exact paused hierarchy payload.
7. After approval, it creates the hierarchy paused and reads every object back from the provider.
8. It verifies object status, policy state, tracking, budget, destination, and Page/Instagram or Google identity dependencies.
9. Activation requires a second exact-payload approval.
10. DeepSeek reports the real persisted state; it never presents pending, partial, dispatched, or uncertain work as completed.

## Read-only path

Readiness checks, capability discovery, reports, and tracking audits run without approval. They remain scoped to configured accounts/properties and carry source, synchronization time, attribution basis, timezone, currency, and data-quality warnings.

## Mutation path

Every create, update, delete, pause, budget/bid change, experiment action, GA4 Admin change, and activation requires exact-payload approval. There are no standing approvals in v1. A batch may share one checkpoint only when its brief exposes every operation and payload hash; every partial failure remains visible.

The approval brief contains provider/account, objective, audience, placements, creative, destination, conversion goal, schedule, budget, bid strategy, tracking, warnings, exact changes, and expected outcome. Missing required information leaves a durable draft and causes no provider request.

## Account selection

DeepSeek may select an account/property automatically only when exactly one verified default exists. When multiple eligible choices exist, it asks the operator to choose.

## Monitoring and optimization

Monitoring runs on demand and daily at 08:00 in the provider account timezone. Optimization output is a proposal containing its evidence period, conversion lag, minimum-data status, expected result, cooldown, and stop condition. Applying any proposal follows the mutation path.

## Failure behavior

- `VERIFIED` is the only completed provider-write state.
- Pending, `AUTHORIZED`, `DISPATCHED`, `PARTIAL`, and `UNCERTAIN` states remain unresolved.
- An uncertain create is never retried automatically; DeepSeek requests provider-state reconciliation.
- Missing access, readiness, assets, identifiers, tracking, or policy eligibility becomes a decision-ready manual handoff.

## Reporting and notification

Reports are persisted. DeepSeek returns a concise summary and a reference to detailed results. DeepSeek responses and the existing dashboard surface approvals, failures, partial results, tracking defects, and uncertain operations. Email and chat notifications are outside v1.

## Rollout order

1. Meta: Awareness, Traffic, Engagement, Leads, then Sales, client accounts, and App Promotion.
2. Google Ads: Search, Performance Max/Shopping, Demand Gen, Display, and App. Legacy Video remains reporting/manual.
3. GA4: readiness, reporting, audits, approved Admin changes, and cross-platform reconciliation.

## External verification boundary

Contracts and local tests can be completed without credentials. Each capability remains `UNVERIFIED` until it passes authenticated tests in the designated provider account. Every client deployment has its own database, encryption key, credentials, and storage volume.

## Resolved constraints

- DeepSeek Harness is the only conversational entry point required for v1.
- No background campaign creation occurs without an operator request.
- Meta precedes Google Ads; GA4 reconciliation follows both.
- Verified stored defaults are reused; the operator is not asked to repeat known information.
- Unverified, stale, conflicting, or high-risk values are never silently defaulted.
- Launch has two checkpoints: paused creation and post-verification activation.

## Definition of done

An operator can state an advertising or measurement outcome to DeepSeek, answer only genuinely missing high-risk questions, inspect a concise exact-payload brief, create a paused hierarchy, verify it remotely, separately approve activation, receive scheduled/on-demand monitoring, and reconcile reports without DeepSeek fabricating support, approval, dispatch, verification, or revenue.
