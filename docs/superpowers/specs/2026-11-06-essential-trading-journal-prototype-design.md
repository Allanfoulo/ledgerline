# Essential Trading Journal Prototype Design

**Date:** 2026-11-06  
**Status:** Approved and implemented as a local prototype  
**Target:** `D:\Development\Rea` (currently an empty, non-Git workspace)

## Goal

Create an original, clickable React + TypeScript prototype for an Essential-level trading journal. The first iteration focuses on the dashboard and core trade review, using fixed sample Forex trades. The structure should leave room for higher-tier capabilities later without implementing them now.

The prototype may use TradeZella's publicly documented workflows as product research, but it will use its own name, visual identity, layout details, copy, and sample data.

## Approved product scope

### Dashboard

- Dark trading-oriented visual direction, following the user's selection of the performance-overview layout.
- KPI strip: net P&L, win rate, and profit factor.
- Daily P&L calendar.
- Equity curve based on the sample trade history.
- Recent trades list.
- Clicking a calendar day opens that day's trade review; clicking a trade opens its detail.

### Trades

- Day, Week, and All views.
- Day view groups trades by date and surfaces that day's notes and summary.
- Week view follows calendar weeks (Sunday–Saturday), showing daily P&L tiles, empty days, weekly summary stats, and access to individual active days.
- All view is a sortable/filterable trade table.
- Filters and navigation use local UI state and the fixed fixture dataset.

### Trade detail

- Forex pair, direction, lot size, entry and exit prices/times, and execution/fill details.
- Gross P&L, commissions, swap, and net P&L shown separately.
- Tags and strategy label.
- Trade-specific note and day-level note, editable in memory for the current browser session.

## Sample market and P&L rules

- Use a USD-denominated account and USD-quoted major pairs only: EUR/USD, GBP/USD, and AUD/USD.
- One standard lot has a pip value of $10 for these pairs.
- Pip size is 0.0001 for these pairs.
- `signedPips = ((exitPrice - entryPrice) / pipSize) * directionSign`, where `directionSign` is `+1` for long and `-1` for short.
- `grossPnl = signedPips * 10 * lotSize`.
- `netPnl = grossPnl - commissions - swap`.
- Prices and trades are static fixtures. No real-time feed, broker connection, conversion-rate lookup, or investment guidance is included.
- Display values to two decimal places; display pip results to one decimal place. Negative values use a clear loss color and sign.

## Interaction and state

- Use typed trade fixtures, with UI components reading the same source data.
- Derive dashboard KPIs, calendar totals, and equity-curve points from the fixture data rather than duplicating summary values.
- Navigation between Dashboard, Trades, and Trade Detail works without a server.
- Day/Week/All tabs, date selection, filters, table sorting, and temporary notes work against local in-memory state.
- Reloading resets the prototype to its original sample data; persistence is out of scope.

## Implementation shape

- Vite + React + TypeScript single-page application.
- Reusable components for the app shell/navigation, KPI cards, calendar, equity curve, trade table, and detail view.
- Separate typed Forex fixture data and calculation/aggregation helpers from presentation components.
- Use native SVG/CSS for the small charts where practical; avoid adding charting dependencies unless the prototype clearly needs them.
- Responsive layout with a desktop-first dashboard and usable narrower layouts.

## Out of scope for this iteration

- User accounts, authentication, database, durable note storage, or broker import/sync.
- Subscription checkout, billing, or feature gating.
- Live quotes, multiple account currencies, non-USD-quoted FX pairs, or currency conversion.
- Reports catalog, strategy management, manual/automated backtesting, trade replay, prop-firm sync, AI features, or social/mentor workflows.

The component and data boundaries should make those features possible to add later. No plan prices or TradeZella account limits are copied into this prototype.

## Research basis and evidence boundary

Public TradeZella documentation describes a Dashboard, Day/Week/All trade review, a sortable/filterable trade log, day notes, and trade details with executions, charts, tags, and notes. Its feature and pricing pages describe account/strategy/replay/AI limits by subscription tier. This prototype uses the workflow concepts only as reference.

- [TradeZella Trades page documentation](https://help.tradezella.com/en/articles/17096919-understanding-the-trades-page)
- [TradeZella Getting Started](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella)
- [TradeZella Features](https://www.tradezella.com/features)
- [TradeZella public pricing](https://www.tradezella.com/pricing)

REA is connected in the active Codex session, but its browser scenario provider previously failed during cleanup and retained browser capabilities. No authenticated or live TradeZella capture was obtained. This design relies on public TradeZella Help Center and pricing documentation; account-only behavior and exact private calculations remain unverified.

## Implementation sequence after spec approval

1. Scaffold the Vite React + TypeScript app in the workspace.
2. Add typed Forex fixtures and unit-consistent P&L/aggregation helpers.
3. Build the shared app shell and Dashboard layout.
4. Add Day/Week/All trade review and trade details, including in-memory notes.
5. Open the prototype in a browser for a visual walkthrough and correct layout issues based on observed rendering.

No test suite is included in this plan unless the user asks for tests.
