# SidePrint implementation status

## Baseline: 2026-11-13

Branch `feature/sideprint-trade-prints` starts at `ebaf87a` on the local SidePrint redesign; merged PR #2 is included through main merge `77f613b`. Baseline `npm test` passed 31 tests and `npm run build` passed. The branch is not deployed.

Existing components: `convex/connector.ts` validates connector tokens, broker binding, source keys, execution totals and supported trades; inserts journal trades and executions inside one mutation. `convex/journal.ts` handles account ownership, manual/CSV journal entries and fills. `convex/identity.ts` supports legacy owner identifiers. `connector/mt5_sync.py` polls locally every 60 seconds by default, with terminal and process running. `connector/mt5_normalize.py` preserves supported closed-position fills and broker symbols. Charts in `src/BacktestChart.tsx` are session-only; `src/Replay.tsx` uses Twelve Data candles. Real trades, sample trades and backtest sessions are separate. `convex/secrets.ts` retains server-side provider credentials.

Not implemented: durable Trade Prints, chart jobs, image rendering, review queue, immutable plans, persisted drawings, AI or public sharing. Existing fills record date and minute precision, not exact execution milliseconds. Existing trades lack explicit origin except MT5 source keys; manual and CSV cannot be reliably distinguished retrospectively. No deployed status is inferred from local code.

## M1 design

Create one owner/account-scoped `tradePrints` record transactionally for each newly inserted supported MT5 trade, with source `mt5`, `minute` time precision and `pending_chart` state. The record is the durable future-work item; no worker claims it during M1. An index by trade supports idempotent bounded backfill; owner/account checks protect queries and mutations. A status is displayed only for real trades. Existing MT5 records are not automatically migrated; an authenticated account owner can initiate bounded backfill. No candles, PNG, provider action, scheduler, paid service or production migration is included. Manual/CSV provenance is not guessed; additional Print origins need an explicit future import contract.

Tests must cover repeated import, source/manual collisions, token expiration, owner isolation and backfill idempotence. Preserve existing account binding, deduplication, all financial calculations and connector response counts. Backfill and new Print inserts happen inside Convex mutations so transaction conflict retry protects duplicate creation.
