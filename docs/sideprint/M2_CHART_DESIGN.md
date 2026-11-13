# M2 proposal: chart acquisition and private PNGs

This is a design proposal only. No worker, source, file storage, paid plan, or production service has been deployed. M1 creates a `queued` job, but no worker processes it yet.

## Candidate data-source policy

Prefer an explicitly enabled local MT5 candle task for broker-specific history when the terminal is running and the broker's data license permits the intended storage and use. Request bounded `copy_rates_range` windows using UTC-aware timestamps and retain the original broker symbol. MT5 reports only locally available history, which may be incomplete. Label the result “MT5 candle history,” distinct from broker-deal fills. Source: [MQL5 Python reference](https://www.mql5.com/en/docs/python_metatrader5/mt5copyratesrange_py).

Offer Twelve Data only as a separately configured fallback after confirming the user's plan, symbol coverage and data rights. Record it as provider data, not the broker's actual execution feed. Its pricing and credit rules vary by plan and license; verify the user's current entitlement rather than assuming a cost or redistribution right. Source: [Twelve Data pricing](https://twelvedata.com/pricing). No provider or fallback is enabled without approval.

## Proposed lifecycle and boundaries

1. A transactionally idempotent job identity combines Print ID, source/data revision, chart-spec version and renderer version. A bounded lease/attempt counter prevents simultaneous workers from producing competing current revisions; retries reuse the identity and use capped exponential backoff with redacted error codes.
2. Obtain a bounded window around first/last fills, validate UTC ordering, symbol, numerical OHLC and coverage, and store source, retrieval time, timeframe and gap status. Existing fill timestamps are minute-precision; do not imply more. Long or missing histories yield `needs_data` or `unsupported`, not invented candles.
3. Construct a deterministic, versioned chart spec from the existing fills and financial calculations. An isolated worker renders a PNG from that spec, with explicit execution and candle-source labels. A chart rendered by SidePrint is not an MT5 terminal screenshot.
4. Save image and metadata privately; every read must verify the authenticated owner and account. Avoid exposing durable bearer URLs or public buckets; use an authenticated, owner-checked serving endpoint or equivalently short-lived, carefully controlled access. Convex can serve stored files, but storage URLs are bearer access and must be treated accordingly: [Convex serving files](https://docs.convex.dev/file-storage/serve-files).
5. Failures and retries update the job/Print independently; neither affects a committed trade import. Test worker crashes, duplicate delivery, owner isolation, stale source revisions, missing history and provider rate limits.

## Capacity model for approval

For N eligible imports, a naive single-request-per-trade approach is N candle requests: 100 requests for 100 trades and 1,000 requests for 1,000 trades, before retries. With at most two retries, the upper bound is 300 and 3,000 requests. Shared compatible symbol/timeframe/time windows can reduce actual calls only after a cache policy is verified. At an illustrative 250 KiB per image, 100 images use about 24.4 MiB and 1,000 about 244 MiB before revisions, metadata and bandwidth; actual image size, worker CPU, storage rates and provider credits must be measured. Set owner-level daily caps, concurrency limits, retention and cost alerts before any deployment. Do not treat these examples as a price quote.

## Review gate

Decide source order and entitlements, data retention, private access method, worker host, quotas and cost ceiling. Demonstrate one authorized end-to-end chart and stored image in an isolated deployment before claiming automatic PNG generation. Manual/CSV origins and a full review queue remain separate milestones.
