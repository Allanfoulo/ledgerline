# Convex backend

## Purpose

Own persisted schema, authenticated backend operations, HTTP endpoints, and server-side integrations.

## Ownership

This directory owns Convex functions and persistence boundaries. `convex/_generated` is tool-generated output; do not edit it by hand or add an `AGENTS.md` beneath it.

## Local Contracts

- Authenticate protected operations and derive the acting user on the server. Enforce that each document belongs to that user before reading or mutating it; client-provided account IDs are selectors, never proof of ownership.
- Validate arguments with Convex validators and preserve schema invariants. Make imports and connector synchronization safely repeatable where the domain uses stable external identifiers.
- Keep secrets and provider credentials server-side. Do not return or log secret values; preserve encryption and key-rotation constraints documented in `README.md`.
- Keep trade calculations and use-case rules in the domain/application boundary rather than duplicating them in mutations.
- Backtest and replay persistence represents practice data; do not merge it into real trade records.

## Work Guidance

- Follow existing auth helpers and patterns in `identity.ts`, and verify any legacy ownership compatibility before changing owner checks.
- Treat schema changes and function changes as deployment-sensitive. Do not deploy or alter a remote Convex environment unless the user requested it.
- Keep generated API references in sync through the existing Convex tooling when backend code is intentionally changed; never hand-edit generated files.

## Verification

- `npm run build` type-checks the app; Convex development sync is performed with `npx convex dev` when a backend change requires it and the user has asked for that sync.
- `npm test` includes Convex ownership and persistence regression tests. Run when requested or when backend behavior changes.

## Child DOX Index

None. Generated files under `_generated` remain governed by this file.
