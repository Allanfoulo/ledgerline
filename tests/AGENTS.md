# Automated tests

## Purpose

Own regression tests that protect journal rules, account isolation, connector normalization, chart artifacts, and backtest behavior.

## Ownership

This file governs tests in this directory. `fixtures/` has a child contract for reusable sample data and browser test fixtures.

## Local Contracts

- Prefer deterministic tests with explicit inputs and expected outcomes. Cover boundary cases and failure paths for calculations, timestamps, ownership, imports, and idempotency.
- Never use real credentials, private trade histories, or live account access in automated tests.
- Keep tests separate from production code and use the repository's existing Node and Python test entry points.
- When behavior changes, update or add focused regression coverage where an existing test layer can exercise it.

## Work Guidance

- TypeScript tests are bundled and run by `scripts/test.mjs` through `npm test`.
- The MT5 normalizer Python suite is invoked by `npm run test:mt5`; do not imply it covers every connector module.
- Keep browser fixture artifacts self-contained and use the fixture directory's local contract.

## Verification

- `npm test` runs the configured TypeScript/JavaScript regression suite.
- `npm run test:mt5` runs `test_mt5_normalize.py`.
- Run tests when requested or when code behavior changes; documentation-only changes need document checks instead.

## Child DOX Index

- [`fixtures/AGENTS.md`](fixtures/AGENTS.md) — reusable deterministic data, mock screens, and browser audit fixtures.
