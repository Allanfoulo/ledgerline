# SidePrint agent contract

This file is the project-wide work contract for SidePrint. Read it before editing. Local `AGENTS.md` files refine these rules for their subtree; a child may add detail but must not weaken a project-wide contract.

## Product and safety boundaries

- SidePrint records and reviews personal trading activity. It does not place live orders or provide live quotes. Backtest orders and fills are simulated and must remain clearly distinguished from real trades.
- Preserve authenticated account ownership on every read and write. Never trust a client-supplied owner ID as authorization.
- Do not expose, log, or commit passwords, API keys, connector tokens, or private account data. Keep deployment secrets in their designated environment and preserve encryption behavior for saved provider keys.
- Preserve the meaning and provenance of trade data: instrument, direction, size, execution prices, fees, swap, timestamps, broker identifiers, and sample/simulated status. Timestamps use the documented UTC semantics; do not silently reinterpret or round source data.
- Do not invent market history, execution details, or performance results. Label illustrative data and disclose simulation limits where the product presents them.

## Architecture contracts

- Keep business rules and calculations independent of React, Convex, and provider SDKs. Domain code owns stable rules; application code coordinates use cases through domain contracts; adapters translate external systems; React, Convex, and provider integrations stay at the boundaries.
- Do not move accounting, ownership, or validation rules into UI-only code. Validate untrusted inputs at system boundaries and enforce account scope in backend operations.
- Keep MT5 synchronization read-only. The local connector must never submit orders or transmit terminal passwords.

## Sources of truth

- `PRODUCT.md` describes product scope and product constraints; `DESIGN.md` describes the visual system.
- The nearest source-layer `AGENTS.md` describes local architecture contracts. `docs/sideprint/` holds execution status and decisions; status must distinguish planned, implemented, and deployed work.
- Existing domain code and focused tests are the sources for current calculation and data behavior. Do not document an intended behavior as implemented without checking the code.
- This instruction hierarchy adapts the documentation approach from [agent0ai/dox](https://github.com/agent0ai/dox); its MIT notice is preserved in [`docs/third-party/agent0ai-dox-MIT-LICENSE.txt`](docs/third-party/agent0ai-dox-MIT-LICENSE.txt).

## Work guidance

- Before changing a path, read this file and every `AGENTS.md` from the repository root down to that path. Follow the nearest file for local details and all parents for broader contracts.
- Keep changes within the requested scope. For distinct follow-on features, use a separate feature branch. Do not merge or deploy unless the user asks.
- When a change alters durable ownership, contracts, workflows, or directory structure, update the nearest instruction file and every affected parent index in the same change. Remove stale guidance instead of keeping historical notes.
- Never add credentials or real account exports to source, fixtures, screenshots, or documentation. Use deterministic synthetic fixtures and label them.
- Run only relevant existing verification. For documentation-only changes, check paths, indexes, links, and the diff; do not run application tests unless requested.
- Report what changed and what was actually verified. Do not claim a deployment, data sync, or external action without direct evidence.

## Child DOX Index

- [`src/AGENTS.md`](src/AGENTS.md) — frontend composition and source ownership across the browser app.
- [`convex/AGENTS.md`](convex/AGENTS.md) — backend schema, functions, auth, and data access.
- [`connector/AGENTS.md`](connector/AGENTS.md) — local MetaTrader 5 synchronization and normalization.
- [`docs/AGENTS.md`](docs/AGENTS.md) — documentation organization and durable records.
- [`scripts/AGENTS.md`](scripts/AGENTS.md) — local automation and command-line scripts.
- [`tests/AGENTS.md`](tests/AGENTS.md) — automated test suites and test conventions.
