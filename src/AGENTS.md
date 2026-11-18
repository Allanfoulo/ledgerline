# Browser application

## Purpose

Own the React browser application and its composition of SidePrint screens, shared UI, configuration, data, and utilities.

## Ownership

This file governs root-level screens and components plus `src/config`, `src/data`, and `src/lib`. The `domain`, `application`, and `adapters` folders have narrower contracts in their child files.

## Local Contracts

- Keep UI state and presentation at the browser edge. Route trade validation, accounting, and analytics through application/domain behavior.
- Use adapters for Convex and provider access. Components must not treat hidden UI state as authorization; the backend enforces account ownership.
- Keep sample, real, and simulated records visibly distinct. Preserve the product's documented UTC and money semantics.
- Follow `DESIGN.md` and the existing accessible interaction patterns. Controls need clear labels, keyboard operation, visible focus, and responsive layouts.

## Work Guidance

- Prefer existing shared components, selectors, and typed data structures before adding parallel implementations.
- Keep changes cohesive by screen or user workflow. Avoid coupling unrelated UI to replay or broker synchronization state.
- Never put API keys or connector tokens in browser logs, URLs, fixtures, or persisted client state when the backend owns them.

## Verification

- `npm run build` checks TypeScript and produces the Vite build.
- `npm test` runs the repository's TypeScript/JavaScript regression suite. Run it when requested or when UI changes affect tested behavior.

## Child DOX Index

- [`domain/AGENTS.md`](domain/AGENTS.md) — framework-independent trade, report, chart, and backtest rules.
- [`application/AGENTS.md`](application/AGENTS.md) — use cases and ports that coordinate domain behavior.
- [`adapters/AGENTS.md`](adapters/AGENTS.md) — Convex and external-provider translations.
