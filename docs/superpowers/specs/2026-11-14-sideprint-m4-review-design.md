# M4: Plan links, Print reviews, and Review Queue

**Status:** Approved design; awaiting user review before implementation.

**Branch:** `feature/sideprint-m4-review`
**Baseline:** `feature/sideprint-dox` at `e884877`

## Goal

Connect committed Execution Plans to MT5 Trade Prints through an explicit user decision, let the trader record a versioned post-trade review, and provide a small deterministic queue of the next useful review actions. M4 extends the existing journal without changing broker facts, execution-plan snapshots, or simulated/sample data.

The interface follows the existing SidePrint design system in `DESIGN.md`: compact dark or light surfaces, clear record labels, restrained semantic color, accessible controls, and responsive data layouts. Queue tasks use a focused single-column list. A linked review shows the frozen Plan and actual Execution side by side on wide screens and stacked on narrow screens.

## Current context

The M3 baseline has owner-scoped `executionPlans` and append-only `executionPlanVersions`; MT5 synchronization creates owner/account-scoped `tradePrints` and `printJobs`. Prints are generated only for MT5 imports. Manual and CSV trades do not have reliable origin metadata. Journal fills and entry timestamps currently carry minute precision. Existing plans may have no account assigned.

M4 applies only to authenticated owner-owned MT5 Trade Prints and real imported executions. It does not infer a link, a plan commitment, rule adherence, or market facts. It does not deploy Convex changes.

## Main journeys

### Link a committed plan to a Print

1. A Print with no confirmed link appears in the queue when at least one committed plan is a plausible candidate.
2. Candidate selection is server-derived for the signed-in owner. Candidates must use the same instrument and either the Print's account or no account. Direction compatibility and commit-time proximity rank suggestions but never link one automatically.
3. The user opens a candidate, sees its selected immutable version and timestamp, then confirms or chooses another version. A clear `No pre-trade plan` action records that user decision and opens retrospective review without a link.
4. Confirmation creates an immutable link event bound to the Print's account and the exact selected plan version. Linking an unassigned plan does not mutate the plan or its version. A link is never treated as proof that the plan preceded the trade.
5. A confirmed link may be replaced or removed only by an explicit user action with a reason. The change is a new decision event; earlier decisions remain available for audit. M4 does not silently replace or delete an association.

### Review a Print

1. The review screen presents objective execution facts and saved chart evidence separately from user-authored observations.
2. With a link, render `Plan vN` beside `Execution`, including all recorded fills, fees, swap, net P&L, chart status/image and source timestamps. Without a link, support a full retrospective review labeled `No pre-trade plan`.
3. Ask for user-reported entry/exit/risk adherence (`followed`, `deviated`, `uncertain`, or `not applicable`), a deviation explanation when applicable, and a takeaway. Do not infer adherence from prices or chart shapes.
4. Saving appends a review version; edits create a new version and preserve the prior content. A review is complete only when the required adherence answers and a takeaway are supplied. Uncertainty is a valid answer. Objective trade facts and the linked plan version stay read-only.
5. A cancelled or expired plan can receive a no-trade review without inventing a Print, execution, or P&L. The UI clearly marks this as a plan outcome rather than a trade review.

### Work the Review Queue

The authenticated, server-derived queue is a focused single-column task list with a maximum of five visible items. On phones it uses the existing fixed bottom navigation and scrolls in the content pane. Each task explains why it is present and offers one primary contextual action, plus snooze/dismiss actions where applicable.

Priority is fixed and deterministic:

1. Print awaiting a user decision about one or more ranked plan candidates.
2. Incomplete Print or no-trade review.
3. User-reported deviation that still needs an explicit acknowledgement or follow-up.
4. Actionable chart acquisition/capture issue on a Print.
5. Unfinished Execution Plan drafts.
6. Previous-UTC-week review reminder for accounts with at least one eligible MT5 Print in that week.

Sort within a priority by oldest actionable timestamp, then stable target identifier. Use UTC boundaries for the weekly reminder. Return only the first five eligible items after actions and completed work are applied. Queue generation is read-only and idempotent; queue actions (snooze, dismiss, complete) are persisted separately. A dismissed or snoozed item reappears only when its stable issue fingerprint changes or its snooze expires. Dismissal/snooze requires a reason. A weekly reminder is one owner/account/week task and can be completed or snoozed; it is a reminder, not a weekly report or M5 progress feature.

## Timing and matching rules

- The Print’s pair, account, trade ID and recorded entry minute come from the existing MT5 journal record. Do not reinterpret the raw imported value.
- A candidate must be owner-matched, instrument-matched, and either bound to the same account or accountless. Accountless plans bind to the Print account only in the confirmed link record.
- Candidate ranks use instrument/account eligibility first, then compatible direction, then absolute commit-time distance from the trade entry minute, with stable plan/version ID tie-breaking. All candidates require user confirmation. Do not use pair/direction alone to claim an association.
- Compare the selected immutable version’s server `committedAt` against the recorded entry minute in UTC. Commit strictly before the minute begins is labeled `Before recorded entry minute`; a commit within that minute is `Timing uncertain (minute precision)`; a commit at or after the end of that minute is `Added after recorded entry minute`. If the source timestamp cannot be parsed unambiguously, label timing `Unknown`. Never change the source timestamp or represent any label as broker-verified pre-trade evidence.
- The chosen linked version stays pinned if the plan is revised later. A new link requires a new explicit user confirmation.

## Persistence and boundary design

Add owner-scoped Convex records following the existing identity helpers and validators:

- **Plan-to-Print decision history:** owner, account bound from the Print, Print ID, event (`linked`, `no_pretrade_plan`, or `unlinked`), exact plan and committed plan-version IDs for a link, previous event reference when changing a decision, reason for unlinking, and server timestamp. Events are append-only; one active decision per Print is enforced transactionally.
- **Print review aggregate and versions:** owner, account, target kind (`trade_print` or `no_trade_plan`), target Print or plan IDs, pinned plan-version reference when linked, completion state, and latest version reference. Review versions contain only user-authored answers/takeaway, version number, server timestamp and predecessor reference. Existing plan versions and trade facts are never copied back as mutable user data.
- **Review queue action state:** owner/account scope, deterministic item key and issue fingerprint, action (`snooze`, `dismiss`, `complete`), required reason where relevant, server timestamp and optional snooze expiry. Queue items themselves are derived, not stored as a mutable duplicated queue.

Expose new M4 routes behind a default-off `VITE_PRINT_REVIEWS_ENABLED` feature flag. Enabling the UI requires the matching Convex schema and functions to be deployed; this milestone does not deploy either.

Queries and mutations derive owner identity from the authenticated server context. Client-provided IDs select targets only; the server validates ownership of the Print, execution plan, exact plan version, account, review, and queue target before returning or changing data. Keep sample and replay/backtest IDs outside these APIs. No credentials or user trade exports enter logs or fixtures.

Use typed domain concepts for timing classification, candidate ranking, and queue ordering; keep persistence and Convex validators in adapters. React components render the results and collect explicit decisions; they do not implement authorization, matching, or accounting rules.

## UI and accessibility

- Add a Review Queue destination to desktop navigation and the existing mobile bottom navigation without displacing the current responsive behavior.
- Show zero, loading, error, empty, and maximum-five states. Empty state explains that new MT5 Prints or drafts will appear when actionable.
- Show each task's priority label, concise rationale, UTC/date context, and one primary action. Distinguish user actions from automatic facts.
- For review comparison, use labeled `Plan` and `Execution` columns with a clear divider at desktop widths; stack those sections on mobile. Keep actual executions and saved chart evidence visually separate from plan text and self-reported answers.
- Use explicit timing labels and source labels in text, not color alone. Provide keyboard-operable confirmation dialogs, visible focus, semantic form labels, validation messages, and touch targets aligned with `DESIGN.md`.

## Out of scope

- Automatic plan linking or claiming a pre-trade plan from matching metadata.
- Manual/CSV Trade Print generation or changing MT5 import contracts.
- Live quotes, broker order placement, edit/delete of imported facts, or backtest/sample reviews.
- Persistent chart drawings, playbooks, weekly performance reports, AI, public sharing, or new subscription gates.
- Production or development Convex deployment, migrations, pushing branches, or opening a PR.

## Verification and acceptance

Use the existing repository checks for this vertical slice: focused domain and Convex tests, `npm test`, and `npm run build`. Do not deploy. Add deterministic tests for:

- Owner/account isolation, cross-owner link attempts, accountless-plan binding, same-account eligibility, instrument mismatch, candidate ranking, and explicit confirmation.
- Link pinning to the exact immutable version; plan revisions and link removal never rewrite prior versions.
- UTC minute timing boundaries (just before, inside, exactly at the end, and unparseable input).
- Review save/version append, incomplete versus complete validation, no-plan trade review, no-trade plan review, and objective-vs-self-reported separation.
- Queue tier ordering, stable tie-breaking, maximum of five, exclusion of samples/backtests, issue-fingerprint idempotency, snooze expiry, dismissal reason, and one weekly task per active owner/account/UTC week.
- Responsive review layout and keyboard-accessible queue actions through the project’s available browser workflow if it can run locally.

Update `docs/sideprint/IMPLEMENTATION_STATUS.md` and `DECISIONS.md` with the implemented state and actual verification evidence when work is complete. Keep the PRD packet’s M4 status consistent if it is part of this worktree. Report any environment or browser limitation instead of claiming unperformed verification.
