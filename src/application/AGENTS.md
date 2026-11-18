# Application workflows

## Purpose

Own application-level workflows that coordinate validation, domain behavior, and output preparation for the UI or external boundary.

## Ownership

This directory owns use-case orchestration such as journal operations, trade import alignment, and trade-print rendering preparation. It does not own React presentation or Convex persistence.

## Local Contracts

- Depend on domain types and rules. Keep React, Convex, and provider SDK details out of application workflows.
- Make input requirements, validation outcomes, and side effects explicit to callers.
- Do not duplicate domain accounting rules or allow UI convenience to bypass them.
- Keep persistence and external data access behind adapters or narrow interfaces when an application workflow needs them.

## Work Guidance

- Prefer small functions with typed inputs and outputs that can be exercised without a browser or deployment.
- Treat imports and generated artifacts as workflows with explicit error and partial-success behavior; never discard source identifiers needed for later reconciliation.
- Keep orchestration consistent with the real/sample/simulated separation defined by the domain.

## Verification

- `npm test` includes application and journal behavior tests. Run relevant cases when a workflow changes or when requested.
- Cover invalid input and partial-failure paths in addition to the successful path.

## Child DOX Index

None.
