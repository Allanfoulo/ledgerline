# SidePrint DOX hierarchy

## Goal

Adopt the useful parts of [agent0ai/dox](https://github.com/agent0ai/dox) as an operational documentation hierarchy for SidePrint. The hierarchy should give coding agents clear project-wide rules and progressively narrower ownership guidance without turning the repository into a file-by-file documentation catalog.

DOX is documentation only. This work adds no runtime package, application behavior, or deployment configuration.

## Current project context

SidePrint is a Vite, React, TypeScript, and Convex personal trading journal. It supports trade entry and import, reporting, historical replay and simulated backtesting, and a local MetaTrader 5 connector. `PRODUCT.md` is the existing product summary; `DESIGN.md` describes the visual system. Source code is organized under `src/domain`, `src/application`, and `src/adapters`, with React screens in `src` and persistence functions in `convex`.

The app records and reviews trading activity; it does not place live orders. Preserve account ownership, authentication, data integrity, timestamps, and existing calculations. Keep dependencies pointed inward from UI, provider, and persistence details toward application and domain rules.

## Proposed hierarchy

Create these instruction files:

- `AGENTS.md`
  - `src/AGENTS.md`
    - `src/domain/AGENTS.md`
    - `src/application/AGENTS.md`
    - `src/adapters/AGENTS.md`
  - `convex/AGENTS.md`
  - `connector/AGENTS.md`
  - `docs/AGENTS.md`
    - `docs/sideprint/AGENTS.md`
  - `scripts/AGENTS.md`
  - `tests/AGENTS.md`
    - `tests/fixtures/AGENTS.md`

There is no `src/components` directory, so no document should be created for it. Root-level React screens and components are governed by `src/AGENTS.md`; the narrow child documents apply only to the three existing architecture layers.

## Responsibilities

- **Root `AGENTS.md`:** state the project-wide product truth and safety boundaries, data and account-ownership invariants, clean-architecture dependency direction, branch/workflow expectations, source-of-truth links, and the complete child DOX index. Define how agents discover and apply the nearest instruction files before editing and how they update relevant indexes when structure changes.
- **`src/AGENTS.md`:** cover browser UI, composition, state boundaries, accessibility, and how screens use application operations and adapters. Link to the narrower layer documents.
- **`src/domain/AGENTS.md`:** cover framework-independent models, calculations, validation, and time/currency semantics; domain code must not import React, Convex, or provider SDKs.
- **`src/application/AGENTS.md`:** cover use cases and ports, orchestration, and validation boundaries; application code depends on domain contracts rather than framework implementations.
- **`src/adapters/AGENTS.md`:** cover translation at external boundaries and adapter responsibility for Convex hooks/repositories and provider data. Preserve raw identifiers and source semantics where reconciliation needs them.
- **`convex/AGENTS.md`:** cover authenticated and owner-scoped reads/writes, schema and function validation, secrets, deployment awareness, and keeping business calculations in the application/domain layers. Treat `convex/_generated` as generated output governed by this parent; do not author an instruction file inside it.
- **`connector/AGENTS.md`:** cover the local MT5 connector, supported history normalization, idempotent synchronization, token handling, and the prohibition on transmitting terminal passwords or sending orders.
- **`docs/AGENTS.md`:** cover documentation organization, source-of-truth precedence, dated design/spec artifacts, and updating docs alongside meaningful behavior or architecture changes.
- **`docs/sideprint/AGENTS.md`:** cover SidePrint execution/status and decision documents, keeping status evidence-based and distinguishing deployed, implemented, and planned work.
- **`scripts/AGENTS.md`:** cover local automation and command safety, reproducibility, and avoiding secret or user-data disclosure.
- **`tests/AGENTS.md`:** cover regression coverage for domain behavior, account isolation, provider normalization, and Convex boundaries, plus the repository's test entry points.
- **`tests/fixtures/AGENTS.md`:** cover deterministic, clearly labeled mock data and fixtures; prohibit real credentials or private account data.

Each child file should use the DOX working sections: **Purpose**, **Ownership**, **Local Contracts**, **Work Guidance**, **Verification**, and **Child DOX Index**. Include only sections that add practical local guidance, and give an explicit empty child index where there are no child instruction files. Parent indexes should list each immediate child instruction file and briefly state its scope. Do not copy the same detailed rules into multiple files; root owns global policy and child files link upward for it.

## Scope boundaries

The hierarchy applies to the current source and working directories named above. Do not add instruction files under `.git`, `.tmp`, `node_modules`, static assets, or generated `convex/_generated`. Do not add per-file instruction documents, duplicate the existing product/design documents, or introduce a DOX runtime dependency. New repository directories should receive a child instruction file only when they establish a meaningful ownership boundary; update the nearest parent index whenever one is added or removed.

## Upstream attribution

Use the upstream DOX structure and concepts as a reference, but write SidePrint-specific rules in original language. During implementation, preserve the upstream MIT license and copyright notice in a clearly named third-party notice file if any upstream text or substantial template material is copied. Record the upstream source in the root document. Do not import upstream claims that conflict with SidePrint's product or security requirements.

## Implementation and review sequence

1. After this spec is reviewed and approved, inspect the current upstream DOX root and child guidance again and compare it with SidePrint's current source tree and instructions.
2. Create the proposed instruction files, checking every path and parent/child index for consistency. Keep each file concise and specific to its ownership boundary.
3. Review the resulting hierarchy as a single contract: check links and paths, ensure there are no duplicate or contradictory rules, and confirm generated/excluded directories are not given authored instructions.
4. Verify the repository diff contains only the DOX hierarchy, required attribution, and any explicitly necessary index updates. Since this is documentation-only, do not add or run application tests unless requested; report the document checks performed.

## Acceptance criteria

- All twelve paths in the proposed hierarchy exist, and no unlisted AGENTS files are introduced.
- The root index lists every immediate child file; each nested parent index lists its immediate child instruction files.
- Every file provides actionable, accurate guidance for its owner directory and follows global rules without restating them wholesale.
- Instructions preserve SidePrint's no-live-orders boundary, account isolation, secrets handling, timestamps/accounting integrity, and clean-architecture direction.
- No runtime dependencies or application behavior change.
- Any copied upstream material retains the upstream MIT notice; original SidePrint guidance identifies DOX as the structural source.
