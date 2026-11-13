# Isolated SidePrint QA fixture

Run `npm run dev` and open `/tests/fixtures/sideprint-review.html`. All accounts, trades, candles, API-key status and tokens are synthetic and held in memory only. The fixture does not connect to Convex, Twelve Data or MT5, and is reset on reload. It checks UI behavior rather than live service integration.

For a browser-based spot check, open `/tests/fixtures/responsive-audit.html`, then run the contents of `responsive-audit.js` or `contrast-audit.js` in the parent page's browser console. The checks inspect the synthetic iframe and are not a substitute for screen-reader, physical-device or comprehensive contrast testing.

The synthetic Print chart demo is available at `/tests/fixtures/print-chart-demo.html` and contains no broker or provider data.

The synthetic timestamped image compositor demo is at `/tests/fixtures/print-capture-demo.html`. It creates an in-browser blob using synthetic data; it does not save an image or run after synchronization.
