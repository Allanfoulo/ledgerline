# Historical trade replay

The approved first replay uses one-minute historical Forex candles from Twelve Data on the existing trade detail screen. Interpret sample trade dates and times as UTC, request a window around the entry and exit, and display the candles in chronological order with entry and exit markers.

The user can play, pause, step, change speed, and seek using a timeline. Keep the API key in component memory and send it only to Twelve Data for the request. Show a helpful error when data cannot be loaded. Identify the fills as synthetic and explain that one-minute candles do not reveal price movements within each minute. A provider response may contain no data, and sample fills may not match historical prices.
