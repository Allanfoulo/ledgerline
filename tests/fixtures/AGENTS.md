# Test fixtures

## Purpose

Own reusable synthetic data, mock screens, and self-contained browser fixtures used by repository tests and audits.

## Ownership

This file governs all files under `tests/fixtures/`; executable tests and suite conventions are governed by the parent `tests/AGENTS.md`.

## Local Contracts

- Use deterministic, clearly labeled synthetic trades, accounts, and market data.
- Never include user credentials, private account exports, broker tokens, or personally identifying trading history.
- Keep HTML demos self-contained and visibly marked as fixtures; do not make them look like evidence from a live account.
- Avoid fixtures whose behavior depends on network calls, current market prices, or local machine paths.

## Work Guidance

- Reuse existing fixture data when it expresses the needed case. Add the smallest fixture that makes a test or audit reproducible.
- Keep expected results aligned with domain semantics and use UTC timestamps in date-sensitive examples.
- Document fixture-specific setup in the closest fixture README when a file is not self-explanatory.

## Verification

- Run the relevant parent test command when fixture changes affect an automated test.
- For static browser fixtures, inspect linked assets and scripts and confirm no external request or secret is introduced.

## Child DOX Index

None.
