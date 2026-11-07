# Trading journal expansion

## Goal and scope

Extend the personal Forex journal with real trade entry, CSV import, richer analytics, strategies and checklists, manual historical backtesting, and automatic broker/prop-firm synchronization, starting with MetaTrader 5. Improve the existing journal, dashboard, and replay along the way. AI reviews are deferred.

## Architecture

- `domain`: framework-independent trade, execution, account, strategy, and backtest models; money and instrument rules; trade matching and analytics. Use plain values, explicit currency and time-zone information, and no React or Convex imports.
- `application`: use cases for validation, saving and importing trades, deduplicating executions, strategy review, reporting, replay, and backtesting. Define ports for repositories, market data, and broker connections here.
- `adapters`: CSV parsing, Twelve Data and MT5 translation, and Convex repository implementations map external data to domain values. Provider-specific symbols and execution identifiers remain available for reconciliation.
- `presentation`: React screens and components call application operations through adapters. Convex functions authenticate users, validate requests, and persist data without defining trade accounting rules.
- `composition`: wire implementations at application startup. Maintain automated checks for dependency direction and domain behavior.

The current prototype has framework-independent P&L helpers, but `App.tsx` and `Backend.tsx` combine screen state, Convex access, synchronization and orchestration. There is no application layer or trade repository port. On the clean-architecture quick diagnostic this is approximately 3/7, or 4/10: calculations can be run without a database, the component graph appears acyclic, and the UI is separate from calculation helpers, but dependency boundaries, independent use cases, interchangeable persistence, and composition are incomplete. Introduce ports and use cases, move provider-specific orchestration into adapters, and keep React and Convex at the edges.

## Delivery sequence

1. **Foundation and real trades:** establish the layers; add authenticated Convex persistence for trading accounts, trades and executions; implement manual entry and a generic CSV import with column mapping, preview, validation and duplicate detection. Keep sample data identifiable and separate from real trades. Show the selected dataset throughout the dashboard, trade views and reports.
2. **Strategies and reporting:** editable strategies and rule checklists linked to trades; filter performance by pair, period, direction, strategy and account. Calculate metrics from the selected dataset and surface missing values rather than inventing data.
3. **Replay and manual backtesting:** use historical provider candles with explicit timestamp and price-source semantics; support play/pause/step/seek and simulated orders in a backtest, recording fills, costs and outcomes separately from real trades. A candle-based simulation cannot infer the actual intrabar price path.
4. **MT5 sync:** build a user-controlled local connector to a running, authenticated MetaTrader 5 terminal using the official MetaTrader 5 Python integration. Read account information and deal history; map provider deal IDs, position IDs, timestamps, symbols, commissions and swaps; upload through authenticated, scoped endpoints. Match executions into trades, handle partial fills and open positions, and make repeat syncs idempotent. Surface unsupported instruments or ambiguous positions for review. Do not transmit MT5 passwords to Convex or submit orders. The same adapter boundary can later support additional brokers and prop firms; actual availability depends on their platform and permissions.
5. **AI reviews:** deferred until the user asks to begin them.

## First implementation slice

Build the foundation and manual trade entry first, including an account record, validated USD-quoted FX data, persisted trade and execution records, sample/real separation, and views derived from the chosen dataset. Then add a generic CSV import with a preview and row-level errors. Broker synchronization requires this same normalized trade and execution model.

## Verification

Test calculation and validation rules, timezone boundaries, CSV parsing and deduplication, account ownership, sample isolation, and empty/error states. Check the app build and the Convex deployment. For MT5, test matching with deterministic sample deal histories including partial fills, repeated imports, and open positions before connecting a real terminal. Test live account access only after the local connector is configured by the user.

## Research

The official MT5 Python integration provides historical deals by interval or position: https://www.mql5.com/en/docs/python_metatrader5/mt5historydealsget_py. Platform-specific broker access and account authorization still need to be confirmed for the user's particular broker or prop firm.
