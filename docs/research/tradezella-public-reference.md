# TradeZella public reference notes

**Checked:** 2026-11-07  
**Use:** Inform an original personal trading journal prototype. These notes describe public product documentation and do not claim access to a TradeZella account.

## Trade review workflow

- The Trades area has Day, Week, and All views. Common toolbar controls include date range, dollar/percentage display, account selection, filters, and column selection. A trade preview can lead to a full detail page.
- Day view includes daily P&L, trade counts and performance stats, an intraday cumulative net P&L chart, a mini calendar, quick actions, and day notes. The expanded table can show time, instrument, side, net P&L, ROI, realized R, strategy, and tags.
- Week view summarizes a calendar week Sunday through Saturday with daily P&L/trade-count tiles, a weekly P&L chart, weekly stats, and an expandable trade table.
- All view is a sortable and filterable table with history-level summary widgets.
- Trade detail includes a date-specific trade list, daily summary, trade statistics, execution history, chart, running P&L, attachments, and distinct trade and daily notes.

The prototype implements the core Day/Week/All navigation, FX trade list, detail, notes, and review summaries. It does not reproduce TradeZella branding or account-only controls. It uses a static SVG equity curve and synthetic executions instead of chart replay.

## Public prices and tier limits

TradeZella's public pricing page currently lists monthly prices of $35 Essential, $59 Pro, and $99 Ultra. Its yearly billing cards list $315, $531, and $891 respectively (displayed as approximately $26, $44, and $74 per month). The page lists one, 50, and unlimited active accounts; 500, 1,500, and 3,000 monthly AI credits; and 10 strategies for Essential versus unlimited strategies for Pro and Ultra.

The July 2026 Help Center pricing article reports 10 replays per month on Essential, unlimited on Pro and Ultra, and 500 / 1,500 / 3,000 monthly AI credits. The currently published pricing page says Trade Replay is not included in Essential, while describing unlimited replay on Pro and Ultra. These official sources conflict on Essential replay access, so verify the live checkout/account details before relying on that limit.

These price and tier observations are research context only. The prototype does not include subscription plans, price displays, access gates, or billing behavior.

## P&L boundary

The prototype's approved Forex calculation is a transparent USD-quoted-pair model: signed pip movement × $10 per standard lot × lots, then subtract commissions and swap. This is a fixture rule for EUR/USD, GBP/USD, and AUD/USD only. TradeZella's private calculations, broker-specific fill aggregation, and account settings have not been observed through REA or a logged-in session.

## Sources

- [Understanding the Trades Page](https://help.tradezella.com/en/articles/17096919-understanding-the-trades-page)
- [Understanding the Day Tab](https://help.tradezella.com/en/articles/5829446-understanding-the-day-tab)
- [Understanding the Week Tab](https://help.tradezella.com/en/articles/17096845-understanding-the-week-tab)
- [Understanding the Trade Detail Page](https://help.tradezella.com/en/articles/5860216-understanding-the-trade-detail-page)
- [TradeZella public pricing page](https://www.tradezella.com/pricing)
- [TradeZella Help Center pricing article](https://help.tradezella.com/en/articles/8911582-our-pricing)
