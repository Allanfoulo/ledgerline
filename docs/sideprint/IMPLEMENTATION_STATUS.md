# SidePrint implementation status

## Baseline: 2026-11-13

Branch `feature/sideprint-trade-prints` starts at `ebaf87a` on the local SidePrint redesign; merged PR #2 is included through main merge `77f613b`. Baseline `npm test` passed 31 tests and `npm run build` passed. The branch is not deployed.

Existing components: `convex/connector.ts` validates connector tokens, broker binding, source keys, execution totals and supported trades; inserts journal trades and executions inside one mutation. `convex/journal.ts` handles account ownership, manual/CSV journal entries and fills. `convex/identity.ts` supports legacy owner identifiers. `connector/mt5_sync.py` polls locally every 60 seconds by default, with terminal and process running. `connector/mt5_normalize.py` preserves supported closed-position fills and broker symbols. Charts in `src/BacktestChart.tsx` are session-only; `src/Replay.tsx` uses Twelve Data candles. Real trades, sample trades and backtest sessions are separate. `convex/secrets.ts` retains server-side provider credentials.

Not implemented: durable Trade Prints, chart jobs, image rendering, review queue, immutable plans, persisted drawings, AI or public sharing. Existing fills record date and minute precision, not exact execution milliseconds. Existing trades lack explicit origin except MT5 source keys; manual and CSV cannot be reliably distinguished retrospectively. No deployed status is inferred from local code.

## M1 design

Create one owner/account-scoped `tradePrints` record transactionally for each newly inserted supported MT5 trade, with source `mt5`, `minute` time precision and `pending_chart` state. Create one durable queued `printJobs` record in the same transaction; no worker claims it during M1. An index by trade supports idempotent bounded backfill; owner/account checks protect queries and mutations. A status is displayed only for real trades. Existing MT5 records are not automatically migrated; an authenticated account owner can initiate bounded backfill. No candles, PNG, provider action, scheduler, paid service or production migration is included. Manual/CSV provenance is not guessed; additional Print origins need an explicit future import contract.

Tests must cover repeated import, source/manual collisions, token expiration, owner isolation and backfill idempotence. Preserve existing account binding, deduplication, all financial calculations and connector response counts. Backfill and new Print inserts happen inside Convex mutations so transaction conflict retry protects duplicate creation.

## M1 verification and rollout

Implemented locally: transactional MT5 trade, fill, Print and queued-job creation; owner-scoped listing; explicit 100-trade-page backfill; pending-chart list/detail labels. The UI feature flag `VITE_TRADE_PRINTS_ENABLED` defaults off and must only be enabled after the matching schema and backend functions are deployed together. The UI flag does not disable backend record creation after backend deployment. No scheduled worker consumes queued jobs. Existing real MT5 trades are not modified until the user explicitly runs backfill; each click processes one bounded page and reruns are safe. Sample, manual and CSV trades do not get MT5 Prints in this first slice.

Verification: 34 Node tests pass, including repeat sync, 100 positions, original gold symbol, partial fills, expired token, owner isolation, and repeatable backfill. A full Vite build with an existing Convex URL and UI flag enabled passes. Synthetic browser checks confirmed pending labels in list and detail and a two-page backfill presentation, including a 390px layout. These use fake adapters; a real isolated Convex deployment, concurrent Convex transactions and backend deployment have not been tested. The app was not deployed and no existing records were backfilled.

Rollback: turn off the frontend feature flag; keep the additive tables and existing data intact. Revert the connector mutation to stop creating new records if the backend must be rolled back. Do not delete tables or records. Validate rollback and forward migrations in an isolated deployment before release.

Next: review M1 and approve M2 source, worker, quota and privacy decisions in `M2_CHART_DESIGN.md`. No PNG/chart worker exists yet.

## M2 chart foundation and capture pipeline (implemented locally; not deployed)

The user selected MT5 history first and Twelve Data as an optional fallback. `connector/mt5_chart.py` reads a bounded UTC M1 window. The updated `connector/mt5_sync.py` claims up to five queued chart jobs on each synchronization cycle, requests candles from the matching local MT5 account, and submits only the bounded candle window. It never sends a terminal password or executes an order. The server validates the connector token, broker binding, source position and candle window before attaching candles to the owner-scoped Print.

The signed-in app polls ready jobs while open, builds the chart with Lightweight Charts, captures it through the existing PNG compositor and stores the image in Convex File Storage. The timestamp is issued by the server when capture begins. The image includes the observed candle source, coverage, all recorded execution prices and times, position direction, net P&L and TradingView attribution. The interactive chart and saved image are shown on the real trade detail. Image reads go through an authenticated action that checks the owner; direct bearer URLs are never exposed.

Read-only local verification against one actual gold position returned 998 candles with partial coverage; no trade details, candles or tokens were uploaded. Synthetic tests cover gaps, duplicate/invalid data, gold suffixes, UTC rollover and multiple fills. Synthetic browser checks cover both themes and the integrated Twelve Data fallback path.

This pipeline is implemented in the local feature branch only. It uses two-minute acquisition/render leases and up to three attempts; unavailable MT5 history becomes an explicit `needs_data` state. The connector processes at most five jobs per cycle. The app polls every 15 seconds and captures while the account owner is signed in. If the app is closed, candles remain queued for capture until the owner opens the app again. This is not a server-side renderer. The optional Twelve Data fallback is not connected to this worker.

## Reference-inspired chart workspace

The interactive chart uses the supplied reference as visual direction: chart-first layout, a compact execution record, instrument/source context and responsive stacking. Direction, net P&L and entry/exit roles come from existing trade data and formulas. The mockup's fictional values and unimplemented review controls were not added. Both marker placement and the adjacent fill table use recorded fills; missing-time candles produce an explicit warning. Synthetic dark and 390px screenshots are in `docs/sideprint/screenshots/`.

Automatic timestamped PNG capture after sync is still **not implemented**: there is no queue consumer, job lease/retry, private image storage or authorized retrieval path. A browser PNG compositor has been tested with synthetic data, but it is not attached to synchronization and does not persist an image. Its prototype timestamp uses the client clock; a worker must supply a trustworthy capture time. The visible “Pending capture” state is honest and must not be interpreted as an existing image. Do not claim the reconstructed chart is an MT5 terminal screenshot.

The optional PNG compositor includes the chart, direction, net P&L, recorded fills, source labels, capture time and TradingView attribution. It is a rendering building block, not an automatically saved artifact.

Current implementation update: automatic MT5 candle transfer and browser capture are wired locally; see [M2 automatic Trade Print capture](M2_AUTOMATION_IMPLEMENTATION.md). This newer implementation note supersedes the earlier pending-capture paragraph above.

## M3 execution plans (implemented locally; not deployed)

Commit `9179f66` on the dedicated branch `feature/sideprint-execution-plans` adds a five-section Guided flow and a Quick form over one typed plan structure. Optional account binding is checked against Convex Auth ownership. Draft writes and commits use an optimistic revision number; commit records server time and inserts an immutable original version. Later changes append a version with a reason and link to the previous version. Existing snapshots have no update mutation. Cancellation and expiry require a reason and do not create trades or P&L.

Risk is recorded as a USD maximum loss and/or an account percentage, with optional user-entered protective stop and size notes. No sizing is calculated. Confirmations are user-authored; empty confirmation lists are allowed, with no fixed count. Verified-source confirmations are rejected until a trusted evidence source is implemented. The UI discloses that an unlinked plan timestamp does not prove it predates a trade. `VITE_EXECUTION_PLANS_ENABLED` defaults off and should only be enabled after matching Convex functions and schema are deployed together.

Verification on this branch: app and Convex TypeScript no-emit checks pass; the in-memory test runner passes 43 tests, including five plan tests for validation, account ownership, stale writes, immutable revisions and closure reasons. Vite production bundling passes in memory. The standard `npm test` script cannot create its `.tmp` folder in this restricted worktree, and the full production build cannot write its output; live Convex migrations, signed-in browser review and deployment have not been performed.

Next milestone: M4 Plan-to-Print linking, Print Review and deterministic Review Queue, on a new feature branch. Keep M5+ features isolated on subsequent branches.
