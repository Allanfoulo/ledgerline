"""Pure conversion of MT5 deal history into journal trades; no terminal or network access."""
from datetime import datetime, timezone
from hashlib import sha256
import math


class UnsupportedTrade(ValueError):
    pass


def normalize_position(deals, broker_key, position_id, base, quote, contract_size, tick_size=None):
    expected_size = 100 if (base, quote) == ('XAU', 'USD') else 100000
    if (base, quote) not in {('EUR', 'USD'), ('GBP', 'USD'), ('AUD', 'USD'), ('XAU', 'USD')} or not math.isclose(float(contract_size), expected_size, abs_tol=0.01):
        raise UnsupportedTrade('unsupported currency pair or contract size')
    if (base, quote) == ('XAU', 'USD') and (tick_size is None or not math.isclose(float(tick_size), 0.001, abs_tol=1e-9)):
        raise UnsupportedTrade('unsupported gold tick size')
    if not deals or len(deals) > 50:
        raise UnsupportedTrade('missing or too many executions')
    ordered = sorted(deals, key=lambda deal: (deal['time_msc'], deal['ticket']))
    if any(deal['type'] not in (0, 1) or deal['entry'] not in (0, 1) for deal in ordered):
        raise UnsupportedTrade('unsupported deal or reversal type')
    if len({deal['symbol'] for deal in ordered}) != 1:
        raise UnsupportedTrade('multiple symbols in one position')
    opening = [deal for deal in ordered if deal['entry'] == 0]
    closing = [deal for deal in ordered if deal['entry'] == 1]
    if not opening or not closing or max(deal['time_msc'] for deal in opening) >= min(deal['time_msc'] for deal in closing):
        raise UnsupportedTrade('open, interleaved, or ambiguous position')
    buy = opening[0]['type'] == 0
    if any((deal['type'] == 0) != buy for deal in opening) or any((deal['type'] == 0) == buy for deal in closing):
        raise UnsupportedTrade('mixed position directions')
    if any(not math.isfinite(float(deal['price'])) or not math.isfinite(float(deal['volume'])) or deal['price'] <= 0 or deal['volume'] <= 0 for deal in ordered):
        raise UnsupportedTrade('invalid execution price or volume')
    in_lots = sum(deal['volume'] for deal in opening)
    out_lots = sum(deal['volume'] for deal in closing)
    if not math.isclose(in_lots, out_lots, rel_tol=1e-8, abs_tol=1e-6):
        raise UnsupportedTrade('position is not fully closed')
    first = datetime.fromtimestamp(opening[0]['time'], timezone.utc)
    last = datetime.fromtimestamp(closing[-1]['time'], timezone.utc)
    if first.strftime('%Y-%m-%dT%H:%M') >= last.strftime('%Y-%m-%dT%H:%M'):
        raise UnsupportedTrade('same-minute positions are not supported yet')
    commission = -sum(float(deal.get('commission', 0)) + float(deal.get('fee', 0)) for deal in ordered)
    swap = -sum(float(deal.get('swap', 0)) for deal in ordered)
    if not math.isfinite(commission) or commission < 0 or not math.isfinite(swap):
        raise UnsupportedTrade('unsupported commission or swap')
    source = sha256(f'{broker_key}|{position_id}'.encode()).hexdigest()
    return {
        'sourceKey': f'mt5:{source}', 'brokerSymbol': ordered[0]['symbol'], 'date': first.strftime('%Y-%m-%d'), 'exitDate': last.strftime('%Y-%m-%d'), 'pair': f'{base}/{quote}',
        'side': 'Long' if buy else 'Short', 'lots': in_lots,
        'entry': sum(deal['price'] * deal['volume'] for deal in opening) / in_lots,
        'exit': sum(deal['price'] * deal['volume'] for deal in closing) / out_lots,
        'entryTime': first.strftime('%H:%M'), 'exitTime': last.strftime('%H:%M'),
        'commission': commission, 'swap': swap, 'setup': 'MT5',
        'executions': [{'date': datetime.fromtimestamp(deal['time'], timezone.utc).strftime('%Y-%m-%d'), 'time': datetime.fromtimestamp(deal['time'], timezone.utc).strftime('%H:%M'), 'action': 'Buy' if deal['type'] == 0 else 'Sell', 'price': deal['price'], 'lots': deal['volume']} for deal in ordered],
    }
