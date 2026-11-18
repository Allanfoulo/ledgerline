# Application adapters

## Purpose

Translate Convex, broker, and market-data boundaries into typed SidePrint application and domain values.

## Ownership

This directory owns React/Convex hooks and client-side adapters for authenticated journal, connector, strategy, execution-plan, and backtest operations.

## Local Contracts

- Keep provider and persistence schemas at this boundary. Map them deliberately to domain values and preserve source identifiers and timestamps required for reconciliation.
- Handle loading, empty, and error states explicitly; do not turn missing provider data into invented candles, trades, or prices.
- Authentication and account authorization are enforced by Convex. A client adapter may pass a selected account ID but must not treat it as authorization.
- Keep provider keys and connector tokens out of logs and user-visible error details.

## Work Guidance

- Follow existing `useConvex*` adapter patterns and keep external response parsing out of screen components.
- Translate unsupported or ambiguous provider symbols into actionable errors or skipped records, not guessed domain classifications.
- Keep chart data source and quality metadata attached when workflows depend on it.

## Verification

- `npm test` includes connector, Convex journal, print, and execution-plan adapter coverage. Run relevant tests when an adapter contract changes or when requested.
- Verify loading, error, empty, duplicate, and unsupported-data paths for changes that affect those states.

## Child DOX Index

None.
