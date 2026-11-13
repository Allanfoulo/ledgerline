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

## M2 chart foundation (partial)

The user selected MT5 history first and Twelve Data as an optional fallback. `connector/mt5_chart.py` reads a bounded UTC M1 window without uploading or changing the terminal account. `src/domain/printChart.ts` validates observed OHLC data and creates a source-labeled chart specification retaining all recorded executions and their minute precision. The chart view shows execution-time arrows and an exact-price fill table; arrows are positioned relative to candle bars, not at the actual fill-price coordinates. Missing candles or ambiguous overnight fill dates are not invented.

When an MT5 Print is available and the user explicitly loads existing Twelve Data replay candles, the optional chart can be rendered using that fallback, but only for real recorded executions. The Print remains pending its saved chart. The chart is lazy-loaded and does not claim a broker-terminal screenshot.

Read-only local verification against one actual gold position returned 998 candles with partial coverage; no trade details, candles or tokens were uploaded. Synthetic tests cover gaps, duplicate/invalid data, gold suffixes, UTC rollover and multiple fills. Synthetic browser checks cover both themes and the integrated Twelve Data fallback path.

M2 is not complete: MT5 candle acquisition is not connected to queued jobs or the app; the local reader does not upload; automatic provider fallback, worker leasing/retry, image rendering, private PNG storage, owner-authorized serving and isolated deployment tests are not implemented. No automatic image is created and no provider or production service was deployed. These remain required before claiming M2 complete.
