"""Bounded, read-only broker-candle acquisition; no network or storage operations."""
from datetime import datetime, timedelta, timezone
import math
import re

MAX_TRADE_DURATION = timedelta(hours=72)
MAX_PADDING_MINUTES = 60
MAX_CANDLES = 5000


def acquire_candles(mt5, symbol, entry, exit, padding_minutes=30):
    """Read MT5 M1 bars. Caller owns terminal setup, credentials, and lifecycle.

    Returns actual observed bars in UTC and a complete/partial/unavailable quality.
    This helper does not upload, render, or change a broker account.
    """
    if not isinstance(symbol, str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,64}', symbol):
        raise ValueError('Invalid broker symbol.')
    if not isinstance(entry, datetime) or not isinstance(exit, datetime) or entry.utcoffset() != timedelta(0) or exit.utcoffset() != timedelta(0):
        raise ValueError('Use timezone-aware UTC execution times.')
    if entry.second or entry.microsecond or exit.second or exit.microsecond or exit <= entry or exit - entry > MAX_TRADE_DURATION:
        raise ValueError('Use minute-aligned times for a trade up to 72 hours.')
    if not isinstance(padding_minutes, int) or isinstance(padding_minutes, bool) or not 0 <= padding_minutes <= MAX_PADDING_MINUTES:
        raise ValueError('Invalid chart padding.')
    start = entry - timedelta(minutes=padding_minutes)
    end = exit + timedelta(minutes=padding_minutes)
    rates = mt5.copy_rates_range(symbol, mt5.TIMEFRAME_M1, start, end)
    if rates is None or len(rates) == 0:
        return {'source': 'mt5_candles', 'symbol': symbol, 'quality': 'unavailable', 'candles': []}
    if len(rates) > MAX_CANDLES:
        raise ValueError('Too many candles.')
    result = []
    seen = set()
    for row in rates:
        timestamp = int(row['time'])
        when = datetime.fromtimestamp(timestamp, timezone.utc)
        values = [float(row[k]) for k in ('open', 'high', 'low', 'close')]
        o, h, l, c = values
        if when.second or when < start or when > end or timestamp in seen or not all(math.isfinite(v) and v > 0 for v in values) or h < max(o, l, c) or l > min(o, h, c):
            raise ValueError('Invalid MT5 candle data.')
        seen.add(timestamp)
        result.append({'time': when.strftime('%Y-%m-%dT%H:%M:%S'), 'open': o, 'high': h, 'low': l, 'close': c})
    result.sort(key=lambda row: row['time'])
    in_trade = sorted(t for t in seen if entry.timestamp() <= t <= exit.timestamp())
    complete = bool(in_trade) and in_trade[0] == entry.timestamp() and in_trade[-1] == exit.timestamp() and all(b - a == 60 for a, b in zip(in_trade, in_trade[1:]))
    return {'source': 'mt5_candles', 'symbol': symbol, 'quality': 'complete' if complete else 'partial', 'candles': result}
