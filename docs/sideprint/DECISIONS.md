# SidePrint decisions

- M1 begins with imported MT5 positions; existing manual/CSV rows cannot be assigned an origin reliably without changing the import contract. Do not mark those rows broker-verified.
- Each pending Print has a durable queued job, but there is no worker consuming it and no completed chart or PNG. There is no paid integration or automatic render in M1.
- Legacy trade backfill is explicitly invoked per owner/account in bounded pages and may be repeated safely. No automatic migration or deployment is authorized.
- Open M2 decisions: broker MT5 candles vs Twelve Data, licensing, candle coverage and UTC alignment, worker host and cost limits, storage privacy/retention, retry policy and quota. No provider is selected or activated by M1.
- Owner/account access follows the current `belongsTo` compatibility rule. Print records use the stored account owner so legacy data remains accessible only to its authenticated owner.

- User approved MT5 candles as the preferred source with Twelve Data as an optional fallback. This approves the source direction, not provider charges, storage quotas, a production rollout, or redistribution rights.
