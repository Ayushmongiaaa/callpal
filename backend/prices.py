"""Real market data from Yahoo Finance.

The dashboard plots what the stock actually did around the earnings call rather
than an invented series. Not every ticker resolves — fictional companies in test
transcripts, foreign listings, private firms — so every function here is written
to return None rather than raise, and the frontend hides the panel when there is
nothing real to show.
"""

from datetime import datetime, timedelta


def _to_date(value: str | None):
    if not value:
        return None

    for fmt in ("%Y-%m-%d", "%B %d, %Y", "%b %d, %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue

    return None


def price_reaction(ticker: str, call_date: str | None = None, window: int = 30):
    """Daily closes around an earnings call, plus the one-day reaction.

    Returns None when the ticker has no data, which is the normal case for the
    fictional companies used in testing.
    """
    if not ticker or not ticker.isalpha():
        return None

    try:
        import yfinance as yf
    except ImportError:
        # Dependency not installed yet — treat as "no data" so the dashboard
        # degrades to its honest empty state instead of throwing a 500.
        return None

    anchor = _to_date(call_date) or datetime.utcnow().date()
    start = anchor - timedelta(days=window)
    end = anchor + timedelta(days=window)

    try:
        data = yf.download(
            ticker,
            start=start.isoformat(),
            end=end.isoformat(),
            auto_adjust=True,
            progress=False,
        )
    except Exception:
        return None

    if data is None or data.empty:
        return None

    import pandas as pd

    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)

    needed = [c for c in ("Open", "High", "Low", "Close") if c in data.columns]

    if "Close" not in needed:
        return None

    data = data.dropna(subset=["Close"])
    closes = data["Close"]

    if len(closes) < 2:
        return None

    # Full OHLC so the frontend can draw candles. A candle around an earnings
    # call shows the overnight gap and the intraday range, which a close-only
    # line chart hides entirely.
    series = []
    for idx, row in data.iterrows():
        close = float(row["Close"])
        series.append(
            {
                "date": idx.strftime("%Y-%m-%d"),
                "open": round(float(row.get("Open", close)), 2),
                "high": round(float(row.get("High", close)), 2),
                "low": round(float(row.get("Low", close)), 2),
                "close": round(close, 2),
            }
        )

    # The reaction is the move on the first session at or after the call.
    reaction = None
    for i in range(1, len(closes)):
        if closes.index[i].date() >= anchor:
            before = float(closes.iloc[i - 1])
            after = float(closes.iloc[i])
            if before:
                reaction = round((after / before - 1) * 100, 2)
            break

    if reaction is None and len(closes) >= 2:
        first, last = float(closes.iloc[0]), float(closes.iloc[-1])
        reaction = round((last / first - 1) * 100, 2) if first else None

    return {
        "ticker": ticker.upper(),
        "series": series,
        "reaction_pct": reaction,
        "call_date": anchor.isoformat(),
        "points": len(series),
    }
