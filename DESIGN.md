---
name: Ledgerline
description: A calm, precise personal FX trading journal.
colors:
  canvas: "#101512"
  sidebar: "#131a16"
  surface: "#161d19"
  surface-raised: "#1c2520"
  surface-soft: "#202a24"
  border: "#2a362f"
  border-soft: "#222c26"
  text: "#e9eee9"
  muted: "#93a096"
  muted-dim: "#718076"
  positive: "#a6e4bd"
  positive-strong: "#68c990"
  negative: "#e79b91"
  amber: "#dbba72"
typography:
  display:
    fontFamily: "Manrope, DM Sans, sans-serif"
    fontSize: "31px"
    fontWeight: 650
    lineHeight: 1.16
    letterSpacing: "-0.052em"
  body:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "DM Sans, Segoe UI, sans-serif"
    fontSize: "9px"
    fontWeight: 700
    letterSpacing: "0.11em"
rounded:
  sm: "5px"
  md: "9px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page: "38px"
components:
  button-primary:
    backgroundColor: "#a8e2ba"
    textColor: "#102016"
    rounded: "{rounded.sm}"
    padding: "0 11px"
    height: "33px"
  button-quiet:
    backgroundColor: "#17201a"
    textColor: "#b4c0b7"
    rounded: "{rounded.sm}"
    padding: "0 11px"
    height: "35px"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Design System: Ledgerline

## Overview

**Creative North Star: “The Quiet Ledger”**

Ledgerline treats a trade journal as a clear working record. It keeps the screen calm and dark for repeated review sessions, while each number stays easy to scan and trace back to a trade. The interface has a compact navigation rail, broad review area, and tightly grouped data tables. Profit and loss colors are reserved for outcome values, so they keep their meaning.

The system favors disciplined spacing, quiet borders, and a small set of layered surfaces. Type distinguishes the page title from compact labels and tabular values. It avoids ornamental trading imagery and relies on the calendar, execution details, and notes as the substance of the page.

**Key Characteristics:**

- Deep forest-charcoal canvas with restrained mint-positive and rose-negative signals.
- Tight, readable data density with comfortable separation between review sections.
- Currency and execution values use tabular numerals and explicit fees.
- The path from dashboard summary to day, trade, and note stays visible.

## Colors

The palette uses quiet green-black neutrals and assigns the brighter hues to meaning-bearing results and actions.

### Primary
- **Ledger Mint** (#A6E4BD): Positive net results and selected navigation states.
- **Action Mint** (#A8E2BA): Primary save action.

### Secondary
- **Session Amber** (#DBBA72): Reserved for a future caution or review state; not prominent in the first prototype.

### Neutral
- **Night Canvas** (#101512): Main application background.
- **Rail Charcoal** (#131A16): Persistent navigation rail.
- **Journal Surface** (#161D19): Panels and working areas.
- **Raised Surface** (#1C2520): Interactive controls and secondary surfaces.
- **Soft Surface** (#202A24): Hover and selected calendar-day background.
- **Boundary** (#2A362F): Panel outlines and structural dividers.
- **Primary Ink** (#E9EEE9): Main text.
- **Secondary Ink** (#93A096): Supporting text.
- **Dim Ink** (#718076): Secondary labels and metadata.
- **Loss Rose** (#E79B91): Negative results and short/loss signals.

## Typography

**Display Font:** Manrope (with DM Sans fallback)  
**Body Font:** DM Sans (with Segoe UI fallback)  
**Label/Mono Font:** DM Sans with tabular numerals for market data.

**Character:** Manrope gives headings a distinct, compact shape; DM Sans keeps dense controls and tables neutral and legible. Financial values use tabular numerals so columns remain stable while scanning.

### Hierarchy
- **Display** (650, 24–31px, 1.16): Page headings.
- **Headline** (650, 13px, 1.3): Panel titles.
- **Title** (600, 10–12px, 1.4): Trade symbols, control labels, and card values.
- **Body** (400, 10–12px, 1.5): Descriptions and notes.
- **Label** (650–700, 8–10px, 1.3, uppercase only for compact metadata): Table headers and state labels.

## Layout

Desktop uses a fixed 238px navigation rail beside a flexible content column. Content caps at 1450px and uses 38px page gutters, reducing to 25px at tablet widths and 14px on narrow screens. The dashboard pairs a daily P&L calendar and equity curve, followed by a full-width recent-trades table. At tablet width the chart and calendar stack; below 620px navigation becomes a bottom bar and controls wrap.

Spacing follows a 4px base rhythm. Panels use 12–16px internal padding. Table rows remain compact and rely on column alignment and separators rather than nested card surfaces.

## Elevation & Depth

The system is primarily flat. Surface tone and a single-pixel border establish panel hierarchy; shadows are not used as a default elevation cue. Hover states use a modest surface shift and border change.

## Shapes

Controls and panels use restrained 5–9px corners; larger containers cap at 12px. Tags and status indicators use small radii. Avoid pill shapes for large groups of information.

## Components

- **Navigation item:** Compact icon-and-label row; active state uses a muted green wash and a narrow mint marker.
- **Metric strip:** One outlined group divided into aligned columns; figures are tabular and outcomes use semantic colors.
- **Panel:** Dark surface, thin boundary, consistent heading row, no shadow.
- **Trade table:** Dense, sortable rows with aligned numeric columns, secondary setup labels, and one clear open-detail affordance.
- **Quiet button:** Dark raised surface with an outline; hover brightens the surface and boundary.
- **Primary button:** Mint fill with dark text for a meaningful save action only.
- **Text field:** Dark inset surface, visible focus ring, muted placeholder, and comfortable edit area for notes.

## Do's and Don'ts

- Do label sample trades as illustrative and show fees separately from gross and net P&L.
- Do use positive/negative hues consistently and keep their contrast legible.
- Do keep primary actions distinct from quiet filter controls.
- Don't imply live quotes, connected broker data, or durable note storage.
- Don't make every metric a standalone rounded card.
- Don't use decorative mono type or accent color without a clear data meaning.
