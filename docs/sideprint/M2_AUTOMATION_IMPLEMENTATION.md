# M2 automatic Trade Print capture

This note records the current local implementation and supersedes earlier M2 status statements in `IMPLEMENTATION_STATUS.md` that said the pipeline was not connected.

## Flow

1. The MT5 connector imports closed trades, then claims at most five queued Trade Print jobs for its token-bound broker account.
2. It reads a bounded UTC M1 window from the original broker symbol and submits the candles through the connector-token HTTP route. Convex checks token expiry, account binding, the MT5 source key, symbol, OHLC values, time ordering and the trade window. No candle provider is called.
3. The signed-in SidePrint app polls for owner-scoped capture jobs while open. It builds the same Lightweight Charts view used in the trade detail, adds the actual recorded executions, asks Convex for the capture timestamp, composes the PNG and stores the bytes and storage reference in one authenticated mutation.
4. The saved chart and interactive chart are shown on the associated real trade. Image reads pass through an authenticated action that checks the owner and returns bytes; a bearer download URL is not exposed.

## Bounds and failure behavior

- One-minute data, up to 5,000 observed candles and trades no longer than 72 hours, matching the existing chart validator.
- The connector processes up to five prints per sync cycle. Connector acquisition and browser capture leases last two minutes; the job allows up to three attempts.
- Missing MT5 history is marked `needs_data`. Invalid or missing fills are never invented. Other errors use a short redacted code and bounded retry delay.
- The browser capture worker runs only while the owner is signed in with the app open. Candles can be queued while the app is closed; the image is saved when the app is next opened. This is not a Convex server-side image renderer.
- Candle arrays and PNGs remain stored with the Print. No retention interface, provider fallback worker, production deployment or isolated Convex end-to-end run is included.

## Current rollout state

Changes are local to `feature/sideprint-print-charts`. The schema, endpoints, connector and frontend must be deployed together before the pipeline can run. This implementation did not deploy Convex or Netlify, backfill trades, run the MT5 connector or write to the live journal. The connector uses the existing Settings token and never prints it; the user must restart the connector with the updated code after backend deployment.

The PNG shows a reconstructed SidePrint chart, not an MT5 terminal screenshot. It includes the observed candle source, coverage, direction, net P&L, recorded entry/exit markers, execution prices and times, capture timestamp and TradingView attribution.
