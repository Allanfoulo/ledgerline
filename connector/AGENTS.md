# MetaTrader 5 connector

## Purpose

Own the local Python connector that reads supported MetaTrader 5 history and uploads normalized journal records and chart data.

## Ownership

This directory contains connector entry points and MT5-specific normalization and chart acquisition. Backend token validation and persistence are owned by `convex/`.

## Local Contracts

- Synchronization is read-only: query terminal/account/deal/history data and never call order-placement APIs.
- Never accept, store, print, or transmit an MT5 terminal password. Prompt for the short-lived journal connector token using a hidden input and keep tokens out of diagnostics.
- Preserve broker symbols and source identifiers needed for reconciliation. Skip unsupported or ambiguous positions with an explicit reason; do not silently fabricate trades.
- Keep uploads bounded and authenticated, and preserve idempotency for repeated position/history syncs.
- Keep supported instrument contract and tick semantics consistent with the normalizer and documented product behavior.

## Work Guidance

- Normalize provider-specific data at this boundary; do not leak MT5 object types into the application/domain model.
- Keep terminal paths and deployment endpoints user-configurable. Do not embed machine-specific paths, account identifiers, or credentials.
- Review the Python environment and MT5 integration requirements before changing connector dependencies.

## Verification

- `npm run test:mt5` runs the existing MT5 normalization unit tests.
- The Node regression suite includes connector upload/contract checks through `npm test`.
- Do not connect to a live terminal or upload user data for verification unless explicitly requested.

## Child DOX Index

None.
