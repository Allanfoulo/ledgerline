# SidePrint decisions

- M1 begins with imported MT5 positions; existing manual/CSV rows cannot be assigned an origin reliably without changing the import contract. Do not mark those rows broker-verified.
- Each pending Print has a durable queued job, but there is no worker consuming it and no completed chart or PNG. There is no paid integration or automatic render in M1.
- Legacy trade backfill is explicitly invoked per owner/account in bounded pages and may be repeated safely. No automatic migration or deployment is authorized.
- Open M2 decisions: broker MT5 candles vs Twelve Data, licensing, candle coverage and UTC alignment, worker host and cost limits, storage privacy/retention, retry policy and quota. No provider is selected or activated by M1.
- Owner/account access follows the current `belongsTo` compatibility rule. Print records use the stored account owner so legacy data remains accessible only to its authenticated owner.

- User approved MT5 candles as the preferred source with Twelve Data as an optional fallback. This approves the source direction, not provider charges, storage quotas, a production rollout, or redistribution rights.

- M4 links are user-confirmed, append-only decisions that snapshot the exact committed plan version and bind an unassigned plan to the Print's account in the link record only. Replacements and unlinks require a reason; minute-level timestamps are labeled uncertain within the entry minute.
- M4 reviews append immutable versions and may explicitly record no pre-trade plan or a cancelled/expired no-trade plan. No-trade reviews do not create trades, Prints, executions, or P&L. Samples and backtests stay outside the queue.
- M4 queue tasks are derived in a fixed six-priority order and capped at five. Snooze and dismissal reasons persist against the task's issue fingerprint. The UI remains feature-flagged off by default.
- Following separate user approval, the M4 schema/functions were deployed to development deployment `allanfoulo:rea:dev/allanfoulo` (`kindred-fly-71`) on 2026-11-14. Convex codegen refreshed `convex/_generated`; no production deployment, migration, or backfill occurred.
