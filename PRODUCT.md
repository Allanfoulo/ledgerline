# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Vite, React, and TypeScript, selected by the user for the initial clickable prototype.

## Users

Initially the user building a personal Forex trading journal. Whether it will later serve other traders is undecided.

## Product Purpose

Record and review trading activity through performance summaries, trade history, and notes. Success for the first prototype means making it easy to see how a period went and open a trade or day to understand the result.

## Positioning

The user wants their own trading views informed by TradeZella's publicly documented workflows. A differentiated product position has not been established.

## Operating Context

The first prototype covers Dashboard and core trade review with fixed synthetic Forex trades. It moves from overall performance to Day, Week, or All trade views, then to trade detail and notes.

## Capabilities and Constraints

- First build: Dashboard, Day/Week/All trade views, trade detail, fees, P&L, tags, and temporary notes.
- Sample data: USD account; EUR/USD, GBP/USD, and AUD/USD only.
- Gross/net P&L rules and fee display are defined in `docs/superpowers/specs/2026-11-06-essential-trading-journal-prototype-design.md`.
- No authentication, persistence, broker imports, live prices, subscription billing, or paid-tier gates in the prototype.
- Essential is the first scope; later Pro/Ultra capabilities are possible, but exact product scope and pricing are undecided.
- The app's name, long-term audience, data provider, deployment target, and monetization are undecided.

## Brand Commitments

The user approved a dark trading-oriented interface and the performance-overview dashboard composition. No app name, logo, existing brand assets, or formal visual identity have been supplied. This is an original personal project inspired by public workflow references, not a TradeZella-branded clone.

## Evidence on Hand

- Public reference pages: TradeZella's Trades, Day, Week, trade detail, Getting Started, and public pricing documentation (see `docs/research/tradezella-public-reference.md`).
- No authentic trading history or user-provided logo, product name, or screenshots have been supplied. Prototype trades must be clearly synthetic.
- REA is connected, but its browser scenario provider failed during cleanup, so no live or logged-in TradeZella capture was obtained. Account-only behavior has not been inspected.

## Product Principles

- Make the path from period summary to trade-level explanation direct.
- Keep gross P&L, fees, and net P&L distinguishable.
- Use transparent calculations and visibly synthetic sample data.
- Add complexity only when it supports the review workflow.
- Keep the first version personal and lightweight; leave confirmed open decisions open.

## Accessibility & Inclusion

No product-specific accessibility requirement has been provided. The prototype should still use semantic controls, keyboard-visible focus, readable contrast, and responsive layouts.
