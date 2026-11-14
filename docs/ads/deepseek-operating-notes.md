# Operating notes

- The existing DeepSeek Harness is the user-facing control surface for Meta Ads, Google Ads, and GA4 automation.
- The operator gives DeepSeek a natural-language request describing the desired outcome.
- DeepSeek may ask follow-up questions when required information cannot be safely inferred from stored business context, provider readiness, or existing campaign data.
- DeepSeek reuses verified stored defaults. It asks only for missing blocking or high-risk inputs: budget, objective, destination, audience/geography, conversion goal, creative approval, and activation timing.
- Delivery order remains Meta first, Google Ads second, then GA4.
- Provider writes require exact-payload human approval and create campaign hierarchies paused.
- Campaign launch uses two checkpoints: approval to create the paused hierarchy, followed by separate activation approval after provider readback and readiness verification.
- During specification interviews, the operator prefers all remaining questions in one batch rather than one at a time.
- Read-only reports, readiness checks, capability discovery, and tracking audits run without approval.
- Every provider mutation requires exact-payload approval. No standing or reusable approvals exist in v1.
- Approval briefs include provider/account, objective, audience, placements, creative, destination, conversion goal, schedule, budget, bid strategy, tracking, warnings, exact changes, and expected outcome.
- A single verified default account/property may be selected automatically; multiple candidates require an operator choice.
- Missing inputs leave a durable draft and cause no provider write.
- V1 uses only existing operator-approved creative assets/posts.
- Monitoring runs daily at 08:00 in the provider account timezone and on demand.
- Optimizations are evidence-backed proposals only; mutations always return through approval.
- Batch approval is allowed only when every operation and payload hash is shown. Partial failures remain visible.
- Uncertain writes stop for manual reconciliation and are never automatically retried.
- DeepSeek and the existing dashboard surface pending approvals, failures, partial results, tracking defects, and uncertain operations.
- Reports are persisted; DeepSeek returns concise summaries with references to detailed results.
- CRM/order reconciliation starts with imported orders or an explicitly configured API, without assuming a CRM vendor.
- Every client uses a separate deployment, database, encryption key, credentials, and storage volume.
- Capabilities remain UNVERIFIED until authenticated account tests succeed.
- Only VERIFIED provider writes are described as completed.

