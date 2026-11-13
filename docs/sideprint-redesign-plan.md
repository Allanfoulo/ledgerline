# SidePrint redesign plan

The user-supplied SidePrint packet is the design authority. Preserve existing React, Convex, account isolation, financial calculations and integrations. Do not deploy as part of this branch.

1. Establish the baseline and retain sample/personal data boundaries.
2. Introduce one brand source, a record-inspired mark, theme compatibility, auth and shared workspace styling.
3. Refine review and supporting screens using existing data and behaviors, including simulated backtesting and read-only MT5 wording.
4. Verify light/dark responsive views, core navigation and regression suites; report remaining gaps honestly.

The product is a personal trading journal and performance-review workspace, not a broker or execution platform. The SidePrint name is provisional. Older `ledgerline-theme` preferences remain readable; no database identifiers are renamed.

## Current checkpoint

- Completed: initial identity, auth, shell branding, dashboard heading, trade-detail ordering, favicon, theme preference migration and shared visual refinements.
- Verified: build, JavaScript and MT5 test suites; signed-out sign-up/sign-in/recovery navigation; sample dashboard and trade detail in browser. Auth and sample dashboard captures are in `docs/sideprint-screenshots/`.
- Remaining: full screen-by-screen design pass for import, notebook, strategies, reports, replay, backtest and settings; real-account interaction checks; responsive captures at the specified widths; keyboard/contrast audit; before/after capture matrix. The source styles retain many hard-coded theme values which the Impeccable detector flagged for review.
- Existing portability limitation: the MT5 command displays an installation-specific path; a warning was added, but a cross-platform connector setup has not been implemented.
- No deployment or backend/schema change was performed for this redesign.
