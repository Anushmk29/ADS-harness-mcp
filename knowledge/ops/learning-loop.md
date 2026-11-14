# Learning loop: how the harness remembers what worked

The harness keeps one memory of results and learnings: the `skill_learnings` tool, which works in every department.
Everything in `knowledge/` is general advice. `skill_learnings` holds what is true **for us**. When the two disagree, our recorded evidence wins (router precedence level 2).

## When to call it

| Moment | Action |
|---|---|
| Before planning content, a campaign or a diagnosis | `list` (filter by `category` if useful); build on it, skip what's `ruled_out` |
| 48–72h after a piece is published | `record_result` with the contentId and metrics |
| A test, audit or diagnosis settles something | `add` a learning |
| A hypothesis is tested | `update_status` `confirmed` or `ruled_out`, with the evidence ref |
| Once a week | `retro` |

## Writing a learning
- **pattern:** one declarative sentence, no hedging. Example: "Clinic owners comment more on missed-call cost posts than on AI-feature posts."
- **category:** `icp`, `positioning`, `channel`, `creative`, `offer`, `conversion` or `ops`.
- **evidence.refs:** where it came from, e.g. contentIds, campaign or ad IDs, a report date, a call note. **sampleSize:** how many leads, pieces or conversions it rests on.
- **confidence** (the tool enforces these rules):
  - `hypothesis`: seen once or only suspected. Needs a `testPlan`: the cheapest test that would settle it.
  - `emerging`: one real observation, with at least one ref.
  - `validated`: two or more independent refs, or a sample of 30 or more.
- **Changing your mind:** add the new learning with `supersedes` set to the old id. Nothing is deleted, so it stays clear what we used to believe.
- Never record a panel opinion, a benchmark from a knowledge page, or a guess as a result.

## Weekly retro
`retro` (default 7 days) returns:
- **results:** pieces measured in the window.
- **unmeasured:** pieces published more than 3 days ago with no numbers. Record them first.
- **stalledHypotheses:** open for 14+ days with no update. These are the most valuable to fix: run the test in `testPlan`, or rule them out.
- **ruledOut:** stays listed so nobody re-tests it by accident.
- **focus:** one suggested priority.

Report the retro to the operator with **one focus for the week** and the first action for it.

## Next step after each task
End every task with the single most useful next step and why it follows from the result, for example:
- Published a post → "record its results on <date>, because the ladder needs them to decide the next rung."
- The audit found tracking gaps → "run `ga4_tracking_audit`, because every cost-per-lead figure depends on it."
- The diagnosis was confirmed → "`ads_create_recommendation` for <fix>, then record the cause."
