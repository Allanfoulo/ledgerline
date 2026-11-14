# Domain rules

## Purpose

Own framework-independent models and rules for trades, reports, chart data, execution plans, and backtests.

## Ownership

This directory owns domain types and calculations. It does not own persistence, provider translation, React state, or rendered screens.

## Local Contracts

- Keep trade and performance rules deterministic and independently understandable from their typed inputs and outputs.
- Preserve currency, instrument, direction, size, fees, swap, source, and UTC time semantics. Do not silently normalize ambiguous provider data into a valid-looking trade.
- Keep sample, imported, real, and simulated records distinguishable where the domain model represents them.
- Do not import React, Convex, browser APIs, or provider SDKs into this layer.

## Work Guidance

- Extend the existing trade, report, execution-plan, backtest, and print-chart types before creating duplicate concepts.
- Keep calculations pure where possible and make assumptions explicit in function names or inputs.
- When market-data resolution or intrabar ordering is unknown, preserve that limit rather than infer a price path.

## Verification

- `npm test` runs the focused domain and journal regression tests. Run it when domain behavior changes or when requested.
- Add or update deterministic cases for changed calculations and boundary conditions.

## Child DOX Index

None.
