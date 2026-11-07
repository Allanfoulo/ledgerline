import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'connector'))
from mt5_normalize import UnsupportedTrade, normalize_position


def deal(ticket, entry, kind, volume, price, minute, commission=-1, swap=0):
    stamp = 1793952000 + minute * 60
    return {'ticket': ticket, 'entry': entry, 'type': kind, 'volume': volume, 'price': price, 'time': stamp, 'time_msc': stamp * 1000, 'symbol': 'EURUSD', 'commission': commission, 'fee': 0, 'swap': swap}


class NormalizeTests(unittest.TestCase):
    def test_gold_symbol_and_contract_with_overnight_executions(self):
        first = deal(1, 0, 0, .1, 4000, 0)
        last = deal(2, 1, 1, .1, 4002, 1500)
        first['symbol'] = last['symbol'] = 'XAUUSDz'
        result = normalize_position([first, last], 'a' * 64, 22, 'XAU', 'USD', 100, 0.001)
        self.assertEqual(result['pair'], 'XAU/USD')
        self.assertEqual(result['brokerSymbol'], 'XAUUSDz')
        self.assertNotEqual(result['date'], result['exitDate'])
        self.assertEqual(result['executions'][1]['date'], result['exitDate'])
        with self.assertRaises(UnsupportedTrade): normalize_position([first, last], 'a' * 64, 22, 'XAU', 'USD', 100, 0.01)
        with self.assertRaises(UnsupportedTrade): normalize_position([first, last], 'a' * 64, 22, 'XAU', 'USD', 1000, 0.001)

    def test_partial_fills_match_and_preserve_executions(self):
        deals = [deal(1, 0, 0, .4, 1.1, 0), deal(2, 0, 0, .6, 1.101, 1), deal(3, 1, 1, .3, 1.102, 30), deal(4, 1, 1, .7, 1.103, 31, swap=-2)]
        result = normalize_position(deals, 'a' * 64, 123, 'EUR', 'USD', 100000)
        self.assertEqual(result['side'], 'Long')
        self.assertAlmostEqual(result['lots'], 1)
        self.assertAlmostEqual(result['entry'], 1.1006)
        self.assertAlmostEqual(result['exit'], 1.1027)
        self.assertEqual(result['commission'], 4)
        self.assertEqual(result['swap'], 2)
        self.assertEqual(len(result['executions']), 4)
        self.assertEqual(result['sourceKey'], normalize_position(deals, 'a' * 64, 123, 'EUR', 'USD', 100000)['sourceKey'])

    def test_open_reversal_interleaved_and_other_instruments_are_skipped(self):
        open_trade = [deal(1, 0, 0, 1, 1.1, 0)]
        with self.assertRaises(UnsupportedTrade): normalize_position(open_trade, 'a' * 64, 1, 'EUR', 'USD', 100000)
        with self.assertRaises(UnsupportedTrade): normalize_position([deal(1, 2, 0, 1, 1.1, 0), deal(2, 1, 1, 1, 1.2, 1)], 'a' * 64, 1, 'EUR', 'USD', 100000)
        with self.assertRaises(UnsupportedTrade): normalize_position([deal(1, 0, 0, .5, 1.1, 0), deal(2, 1, 1, .5, 1.2, 1), deal(3, 0, 0, .5, 1.1, 2), deal(4, 1, 1, .5, 1.2, 3)], 'a' * 64, 1, 'EUR', 'USD', 100000)
        with self.assertRaises(UnsupportedTrade): normalize_position([deal(1, 0, 0, 1, 1.1, 0), deal(2, 1, 1, 1, 1.2, 1)], 'a' * 64, 1, 'USD', 'JPY', 100000)

    def test_mismatched_volume_and_same_minute_are_skipped(self):
        with self.assertRaises(UnsupportedTrade): normalize_position([deal(1, 0, 0, 1, 1.1, 0), deal(2, 1, 1, .5, 1.2, 1)], 'a' * 64, 1, 'EUR', 'USD', 100000)
        with self.assertRaises(UnsupportedTrade): normalize_position([deal(1, 0, 0, 1, 1.1, 0), deal(2, 1, 1, 1, 1.2, 0)], 'a' * 64, 1, 'EUR', 'USD', 100000)


if __name__ == '__main__':
    unittest.main()
