# SidePrint QA report

## Automated checks

- `npm run build`: passed.
- `npm test`: 31 passed, including trade calculations, account ownership, import validation, connector behavior, replay calculations, multi-position closing and theme compatibility.
- `D:\Development\Rea\.venv-mt5\Scripts\python.exe -m unittest discover -s tests -p test_mt5_normalize.py -v`: 4 passed.

## Browser checks

A local in-memory test account was used for all write actions. Its data, market candles and connector tokens were synthetic and disappeared on reload; it did not call Convex, Twelve Data or MT5. The fixture is available at `tests/fixtures/sideprint-review.html` when the Vite development server is running.

- Submitted a synthetic XAU/USD trade; the interface reported one saved trade.
- Uploaded a synthetic CSV, reviewed one ready row, and imported it; the interface reported one saved trade.
- Created a strategy and confirmed it appeared in the list.
- Loaded synthetic candles in trade replay and verified the chart and timeline rendered.
- Opened one long and one short simulated position, advanced replay, closed both, and saved the session in memory.
- Created, masked and revoked a mock MT5 connector token.
- Checked sign-up, sign-in and recovery navigation without submitting credentials. Verified the profile menu closes with Escape and returns focus. The visible dashboard controls passed a basic accessible-name spot-check.
- On the sample dashboard, checked viewport widths of 320, 390, 768, 1024 and 1440 CSS pixels for document-level horizontal overflow. At mobile widths, verified the navigation stays fixed while scrolling. Screenshots live in `docs/sideprint-screenshots/`; the original auth references supplied with the brief are in `docs/SIDEPRINT_CODING_AGENT_PACKET/references/` in the original workspace.
- A light-mode settings contrast spot-check found a workspace label at approximately 4.3:1; the text color was darkened. This spot-check is not a full WCAG audit.

## Outstanding verification and limitations

- Live Convex persistence, real Twelve Data responses, and actual MT5 connector token operations were not exercised by the mock UI test. The existing automated backend and connector tests provide coverage but do not replace an end-to-end test with a disposable connected account.
- No full keyboard, screen-reader, or contrast audit was completed for every screen and state. The complete before/after, light/dark and responsive screenshot matrix is not yet available.
- Impeccable reported 376 advisory findings: 241 undocumented color values, 110 font-size values and 25 radius values. These flag design-token consistency and require review; they are not proof of accessibility failures. Many are inherited from the existing styles.
- The MT5 command still contains an installation-specific path and is accompanied by a warning. It needs a separately reviewed portability improvement.
- No production deployment, backend schema change or financial-calculation change was made as part of this redesign.
