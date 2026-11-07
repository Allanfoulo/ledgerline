# Ledgerline · Personal FX Journal

An Essential-first React + TypeScript prototype for reviewing illustrative Forex trades.

## Run locally

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Create an account or sign in on the welcome screen, then use **Add trades** to create a USD account and enter or import closed Forex trades. Use the data selector in the top bar to switch between sample trades and a personal account. Notes, trades, strategies, reviews, and backtest sessions are stored in Convex for the signed-in user.

The current manual and CSV entry model supports EUR/USD, GBP/USD, AUD/USD, and XAU/USD trades in a USD account, including positions that close on a later date. Dates and times are UTC. Commission is a positive cost; a negative swap is a credit. For XAU/USD the journal uses the verified MT5 contract size of 100 ounces per lot and a tick size of 0.001. The app does not place live trades or provide live quotes.

## CSV import

Choose **Add trades**, select an account, and upload a UTF-8 comma-separated file. Map the columns and review the preview before importing. Required fields are `date`, `pair`, `side`, `lots`, `entry`, `exit`, `entryTime`, and `exitTime`; `exitDate`, `commission`, `swap`, and `setup` are optional. Dates use `YYYY-MM-DD` and times use `HH:MM` in UTC. Files contain at most 100 rows and 1 MB. Entries with identical execution and fee fields are skipped within an account unless you explicitly choose to keep matches for that entry or import. Allowing matches can create extra copies if the same file is imported again. MT5 synchronization uses position IDs to keep distinct positions separate while avoiding repeated imports.

```csv
date,pair,side,lots,entry,exit,entryTime,exitTime,commission,swap,setup
2026-11-02,EUR/USD,Long,0.5,1.10000,1.10200,08:00,09:00,3.50,0,London pullback
```

## Strategies, reports and backtesting

Create a strategy with one checklist rule per line, then select it from a saved trade's detail page and check the rules followed. Reports group the selected journal's trades by pair, direction, or strategy and support date filtering. Backtesting uses TradingView Lightweight Charts and historical one-minute candle opens for simulated fills, displays only completed candles plus the current open, and saves practice sessions separately from real trades. Spread, intraminute price paths, cross-day positions, and real execution behavior are not simulated.

## MetaTrader 5 sync

1. Open the MT5 terminal you want to use and sign in to a USD-denominated account.
2. In the journal, create or select a USD trading account. Open **Settings → MetaTrader 5 sync**, select that account and create a connector token. A new token revokes the prior token for that account; tokens expire after 30 days.
3. Select your installed terminal, copy the command shown, and run it in PowerShell. Copy the token and paste it into the hidden prompt. Do not send it in chat.
4. Keep PowerShell and the MT5 terminal open. The connector loads one year of history on its first pass and checks recent history every 60 seconds. Press Ctrl+C to stop it. Use `--once` for a single pass or `--days N` to choose the initial history window.

The local connector only reads terminal account information, symbol details, and deal history. It never submits orders or sends MT5 passwords. Each journal account binds to one MT5 account on its first successful import. It imports fully closed EUR/USD, GBP/USD, and AUD/USD positions with a 100,000-unit contract, and XAU/USD positions with a 100-ounce contract and 0.001 tick size, including straightforward partial fills and overnight positions. The broker's original symbol, such as `XAUUSDz`, is retained. Open, reversed, interleaved, same-minute, unsupported-symbol, and otherwise ambiguous positions are reported as skipped. Repeated MT5 position IDs are skipped; trades that match a manually entered trade are also conservatively skipped. Verify the first sync against your broker's records. The connector and its Python environment live in this D: workspace.

## Historical replay

Create a journal account on the welcome screen, then save a Twelve Data API key in Settings. Convex encrypts the key and uses it server-side to load historical candles; the key is not displayed after saving. Open a trade to use replay. One-minute replay supports trades up to 72 hours; longer positions can still be imported and reviewed. Sample trade times are interpreted as UTC; sample fills are invented and may not match historical prices. Data availability and API access depend on the provider and your plan.

## Convex setup

This workspace is linked through `.env.local` to its Convex development deployment. Run `npx convex dev` to sync backend changes. For another deployment, configure Convex Auth using its setup instructions and set a 64-character random hex `JOURNAL_ENCRYPTION_KEY` as a Convex deployment environment variable. Keep this encryption key stable: changing it makes existing saved API keys unreadable. Never commit `.env.local` or secrets.

## Password recovery

In the Convex dashboard for the linked deployment, add `RESEND_API_KEY` (a Resend sending API key) and `AUTH_EMAIL_FROM` (a sender address permitted by your Resend account) as environment variables. Do not put the key in the browser or commit it. For broader delivery, verify a domain with Resend and use an address on that domain. After syncing the backend, use **Sign in → Forgot password?** and enter the journal account email. The email contains a single-use code that expires after 15 minutes. Enter the code and a new password; Convex Auth invalidates the account's other sessions. A generic message avoids revealing whether an account exists, so check the deployment logs and Resend configuration if no email arrives. Verify delivery before signing out of your existing session.
