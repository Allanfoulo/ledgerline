# SidePrint redesign plan

The user-supplied SidePrint packet is the design authority. Preserve existing React, Convex, account isolation, financial calculations and integrations. Do not deploy as part of this branch.

1. Establish the baseline and retain sample/personal data boundaries.
2. Introduce one brand source, a record-inspired mark, theme compatibility, auth and shared workspace styling.
3. Refine review and supporting screens using existing data and behaviors, including simulated backtesting and read-only MT5 wording.
4. Verify light/dark responsive views, core navigation and regression suites; report remaining gaps honestly.

The product is a personal trading journal and performance-review workspace, not a broker or execution platform. The SidePrint name is provisional. Older `ledgerline-theme` preferences remain readable; no database identifiers are renamed.

## Current checkpoint

- Completed: SidePrint identity, auth, shell, dashboard, trade review and detail, and a shared layout/readability pass for notebook, manual entry and CSV, strategies, reports, replay, backtesting and settings. Theme preference remains backward compatible; the settings and header controls stay in sync.
- Verified: `npm run build`, 31 JavaScript tests and 4 MT5 normalization tests. Browser checks used synthetic sample trades for dashboard, trade detail and reports, and an isolated settings fixture for theme controls. Sign-up, sign-in and recovery forms were opened without submitting credentials. At 320 and 390 CSS pixels the sample dashboard had no document-level horizontal overflow and the bottom navigation remained fixed during scroll; width/overflow was also checked at 768, 1024 and 1440 pixels. Captures are in `docs/sideprint-screenshots/`.
- Remaining QA: the entire authenticated flow (including manual/CSV saves, strategies, live historical replay, practice-session save and MT5 token actions) was not exercised end to end against a real account. The full before/after and responsive capture matrix, keyboard and contrast audit remain incomplete. The Impeccable detector returned 376 advisory findings, largely inherited hard-coded design values; they need manual review.
- Existing portability limitation: the MT5 command displays an installation-specific path; a warning was added, but a cross-platform connector setup has not been implemented.
- No deployment, backend schema, trading formula or connector logic change was performed for this redesign. The branch remains local until publication is explicitly authorized.

Further QA results and remaining live-service limitations are documented in `docs/sideprint-qa-report.md`.
