# Project documentation

## Purpose

Own product, design, research, execution, decision, audit, and implementation documentation.

## Ownership

This file governs `docs/` except where a child instruction file narrows its subtree. Root `PRODUCT.md` and `DESIGN.md` remain the product and visual-system references.

## Local Contracts

- Keep documentation factual and aligned with the current code and deployment evidence. Mark plans and unverified assumptions as such.
- Keep dated design specs in `docs/superpowers/specs/` and durable SidePrint status/decision records under `docs/sideprint/`.
- Do not add credentials, private trade exports, or identifying account data to docs or screenshots.
- Attribute external frameworks and preserve their required license notices when copying or adapting substantial material.

## Work Guidance

- Update the nearest durable record when implementation changes its truth. Remove stale instructions rather than maintaining parallel histories.
- Prefer links to authoritative sources and repository paths over duplicating long source documents.
- Keep research, screenshots, audits, and execution status in their existing directories unless a material ownership change justifies a move.

## Verification

- For documentation changes, check links and referenced paths, parent/child indexes, dates, and the final diff. Application tests are not a substitute for these checks.
- Use `npm run build` or `npm test` only when documentation accompanies code changes or the user requests those checks.

## Child DOX Index

- [`sideprint/AGENTS.md`](sideprint/AGENTS.md) — SidePrint implementation status, milestones, and decisions.
