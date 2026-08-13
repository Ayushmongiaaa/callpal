"""Find earnings calls without having to hunt down a transcript file.

Backed by Alpha Vantage, which publishes two endpoints we need:

    SYMBOL_SEARCH            ticker lookup from a company name
    EARNINGS_CALL_TRANSCRIPT full transcript for a symbol and quarter

Both are on the free tier. The free key allows roughly 25 requests a day, so
results are cached in memory for the life of the process — typing "nvid" in the
search box would otherwise burn four requests before you finish the word.

The key lives in ALPHAVANTAGE_API_KEY. Without it, search returns a clear
message rather than failing: uploading a file still works, and the app should
degrade to that rather than break.
"""

import os
import re
import time
import urllib.parse
import urllib.request

from config import setting

BASE = "https://www.alphavantage.co/query"
TIMEOUT = 25

# question -> (fetched_at, payload)
_cache: dict[str, tuple[float, object]] = {}

# Six hours, not thirty minutes.
#
# A published transcript for a quarter that has already happened never changes,
# so a short TTL bought nothing and cost real requests: looking at the same
# company twice in an afternoon spent the budget twice. The walk-back can use
# up to four requests to find a company's latest call, so with 25 a day that is
# the difference between roughly six companies and roughly twelve.
CACHE_TTL = 60 * 60 * 6


class NoKey(Exception):
    pass


class RateLimited(Exception):
    pass


class NotAvailable(Exception):
    pass


def configured() -> bool:
    return bool(setting("ALPHAVANTAGE_API_KEY"))


def _key() -> str:
    key = setting("ALPHAVANTAGE_API_KEY")

    if not key:
        raise NoKey(
            "Company search needs a free Alpha Vantage key. Get one at "
            "alphavantage.co/support/#api-key and put it in backend/.env as "
            "ALPHAVANTAGE_API_KEY. Uploading a file works without it."
        )

    return key


def _where_to_put_the_key() -> str:
    """Where the key actually lives, which depends on where this is running.

    Telling someone using the deployed site to edit `backend/.env` is nonsense —
    they have no such file. Render sets RENDER in the environment.
    """
    if os.getenv("RENDER") or os.getenv("FRONTEND_ORIGIN"):
        return "Set ALPHAVANTAGE_API_KEY in the Render dashboard."
    return "Check ALPHAVANTAGE_API_KEY in backend/.env."


# Alpha Vantage answers HTTP 200 for everything and explains itself in prose, so
# the only way to tell a spent quota from a bad key is to read the sentence.
#
# The trap: their rate-limit message is "We have detected your API key as XXX and
# our standard API rate limit is 25 requests per day...". It contains the words
# "API key", so testing for those first reported a perfectly good key as
# rejected. Quota is checked first, and the key test now looks for wording that
# only appears when the key is genuinely wrong.
_RATE_SIGNS = (
    "rate limit",
    "requests per day",
    "premium",
    "higher api call",
    "subscribe",
)

_KEY_SIGNS = (
    "invalid",
    "missing",
    "demo",
    "not valid",
)


def _raise_for_note(note: str) -> None:
    lowered = note.lower()

    if any(s in lowered for s in _RATE_SIGNS):
        # Written for the person reading it, who does not know or care who the
        # data provider is. Lead with what happened and what still works —
        # company search is unaffected now that it runs on Yahoo, so the only
        # thing lost is pulling a published transcript automatically.
        raise RateLimited(
            "Pulling published transcripts is out for today — the free data "
            "tier allows about 25 a day and resets at midnight UTC. Searching "
            "and uploading your own transcript both still work normally."
        )

    if any(s in lowered for s in _KEY_SIGNS):
        raise NoKey(f"That Alpha Vantage key was rejected. {_where_to_put_the_key()}")

    # Unrecognised. Quota is overwhelmingly the more common cause, and telling
    # someone their key is broken when it is not sends them fixing the wrong
    # thing — which is exactly what the old ordering did.
    raise RateLimited(
        "Company search is unavailable right now — the data provider said: "
        f"{note[:160]}"
    )


def _get(params: dict) -> dict:
    """One Alpha Vantage call, with caching and its quirky errors decoded.

    Alpha Vantage returns HTTP 200 for everything, including being out of
    quota — the failure arrives as an "Information" or "Note" key in the body,
    so status codes cannot be trusted here.
    """
    import json

    params = {**params, "apikey": _key()}
    cache_key = json.dumps({k: v for k, v in params.items() if k != "apikey"}, sort_keys=True)

    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]

    url = f"{BASE}?{urllib.parse.urlencode(params)}"

    with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
        body = json.loads(response.read().decode("utf-8"))

    if not isinstance(body, dict):
        raise NotAvailable("The data provider returned something unexpected.")

    note = body.get("Note") or body.get("Information") or ""

    if note:
        _raise_for_note(note)

    if body.get("Error Message"):
        raise NotAvailable(str(body["Error Message"])[:200])

    _cache[cache_key] = (time.time(), body)
    return body


def _search_yahoo(query: str, limit: int) -> list[dict]:
    """Symbol lookup through Yahoo Finance. No key, no daily cap.

    Typing is where a request budget goes to die: every few keystrokes is
    another lookup, and Alpha Vantage's free tier allows about 25 a day in
    total. Spending that on autocomplete meant the quota was gone before anyone
    had analyzed anything.

    Yahoo has no such cap, and yfinance is already a dependency for the price
    charts, so this costs nothing to add. Alpha Vantage is now only touched when
    a transcript is actually fetched — one request per analysis instead of one
    per keystroke.
    """
    import yfinance as yf

    quotes = yf.Search(
        query,
        max_results=limit * 3,
        news_count=0,
        lists_count=0,
        enable_fuzzy_query=True,
        raise_errors=True,
    ).quotes or []

    results = []

    for q in quotes:
        if not isinstance(q, dict):
            continue

        symbol = (q.get("symbol") or "").strip().upper()
        kind = (q.get("quoteType") or "").upper()

        # Equities only, and skip foreign listings of the same company — they
        # clutter the list and rarely have a transcript behind them.
        if not symbol or "." in symbol or kind not in ("EQUITY", ""):
            continue

        name = (
            q.get("shortname")
            or q.get("longname")
            or q.get("shortName")
            or q.get("longName")
            or symbol
        )

        results.append(
            {
                "symbol": symbol,
                "name": str(name).strip(),
                "type": kind.title() or "Equity",
                "region": q.get("exchDisp") or q.get("exchange") or "",
                "currency": "",
                # Yahoo returns these already ranked, so position is the score.
                "score": 1.0 - len(results) * 0.01,
            }
        )

    return results[:limit]


def _search_alphavantage(query: str, limit: int) -> list[dict]:
    """The original lookup, kept as a fallback if Yahoo is unreachable."""
    body = _get({"function": "SYMBOL_SEARCH", "keywords": query})
    matches = body.get("bestMatches") or []

    results = []
    for m in matches:
        symbol = m.get("1. symbol", "")
        if not symbol or "." in symbol:
            continue

        results.append(
            {
                "symbol": symbol,
                "name": m.get("2. name", ""),
                "type": m.get("3. type", ""),
                "region": m.get("4. region", ""),
                "currency": m.get("8. currency", ""),
                "score": float(m.get("9. matchScore") or 0),
            }
        )

    results.sort(key=lambda r: (r["region"] != "United States", -r["score"]))
    return results[:limit]


def search(query: str, limit: int = 6) -> list[dict]:
    """Companies matching a name or ticker.

    Yahoo first because it is uncapped; Alpha Vantage only if Yahoo fails and a
    key exists. Search must not be the thing that exhausts the transcript quota.
    """
    query = query.strip()

    if len(query) < 2:
        return []

    cache_key = f"search:{query.lower()}:{limit}"
    hit = _cache.get(cache_key)
    if hit and time.time() - hit[0] < CACHE_TTL:
        return hit[1]

    try:
        results = _search_yahoo(query, limit)
    except Exception:
        # Any failure at all — network, a shape change, a rename upstream —
        # falls through rather than breaking the search box.
        results = []

    if not results and configured():
        try:
            results = _search_alphavantage(query, limit)
        except (RateLimited, NoKey, NotAvailable):
            results = []

    _cache[cache_key] = (time.time(), results)
    return results


def recent_quarters(count: int = 8, today=None) -> list[str]:
    """The last few quarters as Alpha Vantage labels them, newest first.

    A quarter that has only just ended has no transcript yet, so we start one
    quarter back.
    """
    import datetime

    today = today or datetime.date.today()
    quarter = (today.month - 1) // 3 + 1
    year = today.year

    out = []
    for _ in range(count + 1):
        quarter -= 1
        if quarter == 0:
            quarter = 4
            year -= 1
        out.append(f"{year}Q{quarter}")

    return out[:count]


def _flatten(payload) -> str:
    """Turn the provider's transcript payload into plain speaker-labelled text.

    The shape is documented as a list of turns, but providers reshape their
    responses without warning, so a bare string and a wrapped list are both
    accepted rather than crashing on the day it changes.
    """
    if isinstance(payload, str):
        return payload.strip()

    if isinstance(payload, dict):
        for field in ("transcript", "content", "text", "data"):
            if field in payload:
                return _flatten(payload[field])
        return ""

    if not isinstance(payload, list):
        return ""

    lines = []
    for turn in payload:
        if isinstance(turn, str):
            lines.append(turn.strip())
            continue

        if not isinstance(turn, dict):
            continue

        speaker = (turn.get("speaker") or turn.get("name") or "").strip()
        title = (turn.get("title") or turn.get("role") or "").strip()
        said = (turn.get("content") or turn.get("text") or "").strip()

        if not said:
            continue

        if speaker and title:
            lines.append(f"{speaker.upper()} ({title}): {said}")
        elif speaker:
            lines.append(f"{speaker.upper()}: {said}")
        else:
            lines.append(said)

    return "\n\n".join(lines).strip()


def transcript(symbol: str, quarter: str) -> dict:
    """One quarter's transcript as plain text, ready for the analyzer."""
    symbol = symbol.strip().upper()

    if not re.fullmatch(r"[A-Z][A-Z0-9.\-]{0,9}", symbol):
        raise NotAvailable(f"{symbol!r} does not look like a ticker.")

    if not re.fullmatch(r"\d{4}Q[1-4]", quarter):
        raise NotAvailable("Quarter must look like 2024Q1.")

    body = _get(
        {
            "function": "EARNINGS_CALL_TRANSCRIPT",
            "symbol": symbol,
            "quarter": quarter,
        }
    )

    text = _flatten(body.get("transcript", body))

    if len(text.split()) < 200:
        raise NotAvailable(
            f"No transcript published for {symbol} {quarter}. "
            "Try an earlier quarter."
        )

    return {"symbol": symbol, "quarter": quarter, "text": text}


def latest_transcript(symbol: str, tries: int = 4) -> dict:
    """Walk back from the most recent quarter until a transcript exists.

    Companies report on different calendars, and the newest quarter is often
    not published yet, so the first hit is rarely the current quarter.
    """
    problems = []

    for quarter in recent_quarters(tries):
        try:
            return transcript(symbol, quarter)
        except NotAvailable as exc:
            problems.append(str(exc))
            continue

    raise NotAvailable(
        f"No published transcript found for {symbol} in the last {tries} "
        "quarters. Upload the transcript directly instead."
    )


# The earnings calendar is the one endpoint here that answers in CSV rather
# than JSON, so it cannot go through _get.
_calendar_cache: tuple[float, list[dict]] | None = None
CALENDAR_TTL = 60 * 60 * 6


def _fetch_calendar(horizon: str = "3month") -> list[dict]:
    """Upcoming reporting dates for the whole market, cached hard.

    One request covers every ticker, so this is fetched whole and filtered
    locally rather than asked per symbol — 25 requests a day does not survive a
    request per company. The payload is a few MB and changes slowly, hence the
    six-hour cache.
    """
    global _calendar_cache

    if _calendar_cache and time.time() - _calendar_cache[0] < CALENDAR_TTL:
        return _calendar_cache[1]

    import csv
    import io

    params = {"function": "EARNINGS_CALENDAR", "horizon": horizon, "apikey": _key()}
    url = f"{BASE}?{urllib.parse.urlencode(params)}"

    with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
        body = response.read().decode("utf-8", errors="replace")

    # Out of quota comes back as JSON even from the CSV endpoint. Route it
    # through the same reader so the calendar and the search cannot disagree
    # about what went wrong.
    if body.lstrip().startswith("{"):
        import json as _json

        try:
            payload = _json.loads(body)
            note = payload.get("Note") or payload.get("Information") or ""
        except ValueError:
            note = ""

        _raise_for_note(note or "rate limit")

    rows = []
    for row in csv.DictReader(io.StringIO(body)):
        symbol = (row.get("symbol") or "").strip().upper()
        date = (row.get("reportDate") or "").strip()

        if not symbol or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            continue

        rows.append({"symbol": symbol, "name": (row.get("name") or "").strip(), "date": date})

    _calendar_cache = (time.time(), rows)
    return rows


def upcoming(symbols: list[str], within_days: int = 45, limit: int = 6) -> list[dict]:
    """The next reporting dates for the tickers the user actually cares about.

    Returns [] rather than raising when the calendar is unavailable: a bell that
    silently has less in it is fine, a bell that errors is not.
    """
    import datetime

    wanted = {s.strip().upper() for s in symbols if s and s.strip()}

    if not wanted:
        return []

    try:
        rows = _fetch_calendar()
    except (NoKey, RateLimited, NotAvailable, OSError, ValueError):
        return []

    today = datetime.date.today()
    out = []

    for row in rows:
        if row["symbol"] not in wanted:
            continue

        try:
            when = datetime.date.fromisoformat(row["date"])
        except ValueError:
            continue

        days = (when - today).days
        if days < 0 or days > within_days:
            continue

        out.append({**row, "days_away": days})

    # Soonest first, and only one entry per company — a ticker can appear twice
    # when a provisional date is followed by a confirmed one.
    out.sort(key=lambda r: r["days_away"])

    seen = set()
    unique = []
    for row in out:
        if row["symbol"] in seen:
            continue
        seen.add(row["symbol"])
        unique.append(row)

    return unique[:limit]
