import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'connector'))
from mt5_chart import acquire_candles

class FakeMT5:
    TIMEFRAME_M1 = 1
    def __init__(self, rows): self.rows = rows; self.request = None
    def copy_rates_range(self, *args): self.request = args; return self.rows

def row(t, price=4000):
    return {'time': int(t.timestamp()), 'open': price, 'high': price + 2, 'low': price - 1, 'close': price + 1}

class ChartTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 11, 2, 23, 59, tzinfo=timezone.utc)
        self.end = self.start + timedelta(minutes=2)
    def test_observed_gold_candles_and_utc_window(self):
        api = FakeMT5([row(self.end), row(self.start), row(self.start + timedelta(minutes=1))])
        result = acquire_candles(api, 'XAUUSDz', self.start, self.end, 30)
        self.assertEqual(result['quality'], 'complete')
        self.assertEqual(result['symbol'], 'XAUUSDz')
        self.assertEqual(result['candles'][0]['time'], '2026-11-02T23:59:00')
        self.assertEqual(api.request[2], self.start - timedelta(minutes=30))
        self.assertEqual(api.request[3], self.end + timedelta(minutes=30))
    def test_gaps_and_missing_data_are_not_fabricated(self):
        self.assertEqual(acquire_candles(FakeMT5([row(self.start), row(self.end)]), 'XAUUSDz', self.start, self.end)['quality'], 'partial')
        self.assertEqual(acquire_candles(FakeMT5(None), 'XAUUSDz', self.start, self.end)['quality'], 'unavailable')
    def test_reject_invalid_input_or_duplicate_bars(self):
        for symbol, start, end in [('XAU USD', self.start, self.end), ('XAUUSDz', self.start.replace(tzinfo=None), self.end), ('XAUUSDz', self.start, self.start + timedelta(hours=73))]:
            with self.assertRaises(ValueError): acquire_candles(FakeMT5([]), symbol, start, end)
        with self.assertRaises(ValueError): acquire_candles(FakeMT5([row(self.start), row(self.start)]), 'XAUUSDz', self.start, self.end)
        with self.assertRaises(ValueError): acquire_candles(FakeMT5([row(self.end + timedelta(hours=2))]), 'XAUUSDz', self.start, self.end)

if __name__ == '__main__': unittest.main()
