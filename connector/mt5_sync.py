"""Read-only MT5 deal synchronization. Never accepts or sends terminal passwords."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
from getpass import getpass
from hashlib import sha256
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

import MetaTrader5 as mt5
from mt5_normalize import UnsupportedTrade, normalize_position


def site_url():
    env_file = Path(__file__).resolve().parent.parent / '.env.local'
    for line in env_file.read_text(encoding='utf-8').splitlines():
        if line.startswith('VITE_CONVEX_SITE_URL='):
            url = line.split('=', 1)[1].strip().strip('"\'')
            if url.startswith('https://') and url.endswith('.convex.site'):
                return url
    raise RuntimeError('Convex site URL is missing from .env.local.')


def upload(url, token, broker_key, trades):
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None

    opener = build_opener(NoRedirect)
    total = {'inserted': 0, 'duplicates': 0}
    for start in range(0, len(trades), 100):
        payload = json.dumps({'brokerKey': broker_key, 'trades': trades[start:start + 100]}).encode()
        request = Request(f'{url}/mt5/sync', data=payload, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, method='POST')
        try:
            with opener.open(request, timeout=30) as response:
                result = json.load(response)
        except (HTTPError, URLError, TimeoutError, OSError) as error:
            raise RuntimeError('Sync failed. Check the token, account mapping, and connection.') from error
        total['inserted'] += result['inserted']; total['duplicates'] += result['duplicates']
    return total


def main():
    parser = argparse.ArgumentParser(description='Sync closed MT5 trades to your journal without placing orders.')
    parser.add_argument('--terminal', required=True, help='Full path to the MetaTrader 5 terminal64.exe')
    parser.add_argument('--days', type=int, default=365, help='Days of history to load initially (1–3650; default 365)')
    parser.add_argument('--interval', type=int, default=60, help='Seconds between syncs, at least 30')
    parser.add_argument('--once', action='store_true', help='Sync once and exit')
    args = parser.parse_args()
    if not 1 <= args.days <= 3650 or args.interval < 30 or not Path(args.terminal).is_file():
        parser.error('Choose an existing terminal executable, 1–3650 days, and an interval of at least 30 seconds.')
    token = getpass('Paste the connector token from journal Settings: ').strip()
    if len(token) != 64 or any(char not in '0123456789abcdef' for char in token):
        print('Invalid connector token.', file=sys.stderr); return 1
    try:
        url = site_url()
        if not mt5.initialize(str(Path(args.terminal).resolve())):
            print('Could not connect to the terminal. Open it and sign in first.', file=sys.stderr); return 1
        info = mt5.account_info()
        if not info or info.currency != 'USD':
            print('Connect a USD-denominated MT5 account first.', file=sys.stderr); return 1
        broker_key = sha256(f'{info.server}|{info.login}'.encode()).hexdigest()
        print('Connected to MT5. Supported closed Forex and gold positions will be synchronized.')
        initial = True
        while True:
            active = mt5.account_info()
            if not active or sha256(f'{active.server}|{active.login}'.encode()).hexdigest() != broker_key:
                print('MT5 account changed or disconnected. Stopping.', file=sys.stderr); return 1
            now = datetime.now(timezone.utc)
            recent = mt5.history_deals_get(now - timedelta(days=args.days if initial else 7), now)
            if recent is None:
                print('Could not read MT5 history. Check the terminal connection.', file=sys.stderr); return 1
            positions = sorted({deal.position_id for deal in recent if deal.position_id and deal.type in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL)})
            normalized = []; skipped = Counter()
            for position_id in positions:
                history = mt5.history_deals_get(position=position_id)
                if history is None: skipped['history unavailable'] += 1; continue
                if not history: continue
                symbol = mt5.symbol_info(history[0].symbol)
                if symbol is None: skipped['symbol unavailable'] += 1; continue
                try:
                    normalized.append(normalize_position([deal._asdict() for deal in history], broker_key, position_id, symbol.currency_base, symbol.currency_profit, symbol.trade_contract_size, symbol.trade_tick_size))
                except UnsupportedTrade as error: skipped[str(error)] += 1
            if normalized:
                result = upload(url, token, broker_key, normalized)
                print(f"Sync complete: {result['inserted']} imported, {result['duplicates']} already present.")
            else: print('No supported closed positions found.')
            for reason, count in sorted(skipped.items()): print(f'Skipped {count}: {reason}.')
            if args.once: return 0
            initial = False; time.sleep(args.interval)
    except (RuntimeError, OSError) as error:
        print(str(error), file=sys.stderr); return 1
    except KeyboardInterrupt:
        print('\nSync stopped.'); return 0
    finally:
        mt5.shutdown()


if __name__ == '__main__':
    raise SystemExit(main())
