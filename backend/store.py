"""Persistence for analyzed calls.

SQLite rather than in-memory dicts: a deployed instance on a free tier sleeps
and restarts constantly, and losing every previously analyzed call on restart
makes the Recent Calls list a lie.

One file, no server, no ORM — appropriate for the size of this project.
"""

import json
import os
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

DB_PATH = os.getenv("CALLPAL_DB", os.path.join(os.path.dirname(__file__), "callpal.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS calls (
    id          TEXT PRIMARY KEY,
    company     TEXT NOT NULL,
    ticker      TEXT,
    website     TEXT,
    quarter     TEXT,
    call_date   TEXT,
    source      TEXT,
    word_count  INTEGER,
    analysis    TEXT NOT NULL,
    chunks      TEXT NOT NULL,
    transcript  TEXT NOT NULL,
    created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calls_created ON calls (created_at DESC);
"""


@contextmanager
def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init():
    with _conn() as conn:
        conn.executescript(SCHEMA)
        _backfill_dates(conn)


def _iso(value):
    from dates import normalise

    return normalise(value)


def _backfill_dates(conn):
    """Rewrite any call_date that predates date normalisation.

    Rows stored before dates.py existed hold values like "April 23rd, 2024",
    which the calendar cannot parse. Cheap to fix in place, and it means an
    existing library is not stuck showing "Invalid Date" forever.
    """
    from dates import normalise

    rows = conn.execute("SELECT id, call_date FROM calls").fetchall()

    for row in rows:
        current = row["call_date"] or ""

        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", current):
            continue

        fixed = normalise(current)

        if fixed != current:
            conn.execute(
                "UPDATE calls SET call_date = ? WHERE id = ?", (fixed, row["id"])
            )


def save(call_id, analysis, chunks, transcript, source):
    with _conn() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO calls
               (id, company, ticker, website, quarter, call_date, source,
                word_count, analysis, chunks, transcript, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                call_id,
                analysis.get("company", ""),
                analysis.get("ticker", ""),
                analysis.get("website", ""),
                analysis.get("quarter", ""),
                _iso(analysis.get("date", "")),
                source,
                len(transcript.split()),
                json.dumps(analysis),
                json.dumps(chunks),
                transcript,
                datetime.now(timezone.utc).isoformat(),
            ),
        )


def get(call_id):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM calls WHERE id = ?", (call_id,)).fetchone()

    if not row:
        return None

    return {
        "analysis": json.loads(row["analysis"]),
        "chunks": json.loads(row["chunks"]),
        "transcript": row["transcript"],
        "source": row["source"],
    }


def recent(limit=25):
    """The call library, with enough of each analysis to chart and compare.

    The list pages need sentiment, guidance and the forward revenue figure, and
    fetching every call individually to get them would be a request per row.
    The analysis JSON is already in the row, so the useful fields are lifted out
    here instead — the transcript and chunks, which are large, are not.
    """
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, company, ticker, website, quarter, call_date, source,"
            " word_count, analysis, created_at FROM calls"
            " ORDER BY created_at DESC LIMIT ?",
            (limit,),
        ).fetchall()

    out = []

    for row in rows:
        call = dict(row)
        analysis = json.loads(call.pop("analysis") or "{}")

        sentiment = analysis.get("sentiment") or {}
        guidance = analysis.get("guidance") or {}
        risks = analysis.get("risk_flags") or []

        call.update(
            {
                "sentiment": sentiment.get("score"),
                "sentiment_label": sentiment.get("label", ""),
                "guidance": guidance.get("direction", "Not Given"),
                "guidance_summary": guidance.get("summary", ""),
                "revenue_outlook": analysis.get("revenue_outlook", ""),
                "risk_flags": risks,
                "risk_count": len(risks),
                "bullish": [p.get("text", "") for p in analysis.get("bullish_points") or []],
                "bearish": [p.get("text", "") for p in analysis.get("bearish_points") or []],
            }
        )

        out.append(call)

    return out


def delete(call_id):
    with _conn() as conn:
        cur = conn.execute("DELETE FROM calls WHERE id = ?", (call_id,))
        return cur.rowcount > 0


def stats():
    with _conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) AS calls, COALESCE(SUM(word_count), 0) AS words"
            " FROM calls"
        ).fetchone()
        companies = conn.execute(
            "SELECT COUNT(DISTINCT ticker) AS n FROM calls WHERE ticker != ''"
        ).fetchone()

    return {
        "calls": row["calls"],
        "words": row["words"],
        "companies": companies["n"],
    }
