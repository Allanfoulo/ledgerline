# Product

<!-- impeccable:product-schema 1 -->

## Platform and audience

SidePrint is a web-based personal trading journal and performance-review workspace for independent traders, initially supporting documented Forex and XAU/USD workflows. The name is provisional pending clearance.

## Purpose

Help traders record their trading history, review decisions and refine their process. Every trade leaves a print.

## Product truth and constraints

The existing Vite, React, TypeScript and Convex app supports account-owned journals, sample data, trade entry and CSV import, strategy checklists, reports, historical replay and simulated backtesting. A local MetaTrader 5 connector reads supported closed-position history; historical candles use a user-supplied Twelve Data key. The app does not execute real orders. Existing account isolation, UTC semantics, calculations, authentication and data must be preserved.

## Experience principles

- Make the path from performance overview to trade and notes clear.
- Identify sample data and simulated trades explicitly.
- Show fees, gross and net outcomes accurately; do not imply investment results.
- Use calm, readable dark and light interfaces with keyboard-accessible controls.
- Keep product screens focused on work; reserve expressive editorial treatment for marketing.
