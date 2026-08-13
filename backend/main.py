"""CallPal API.

    POST /analyze        transcript, document, audio or video -> structured analysis
    POST /chat           question about a stored call -> cited answer
    GET  /calls          every call analyzed so far
    GET  /calls/{id}     one stored call
    DEL  /calls/{id}     remove a call
    GET  /calls/{id}/transcript   the extracted text
    GET  /stats          totals for the Insights page
    GET  /search         company lookup for the search bar
    POST /analyze/{sym}  fetch a published transcript and analyze it
    GET  /prices         real OHLC around a call date
    GET  /health         liveness + which model is live

Calls are stored in SQLite so they survive a restart — a free-tier host sleeps
constantly, and a Recent Calls list that empties itself is worse than none.
"""

import os
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel

load_dotenv()

import discover  # noqa: E402
import store  # noqa: E402
from dates import normalise as normalise_date  # noqa: E402
from analyzer import (  # noqa: E402
    BadKey,
    MissingKey,
    active_model,
    analyze_transcript,
    answer_question,
    sentiment_timeline,
)
from extractor import UnsupportedFile, chunk, clean, extract_text  # noqa: E402
from media import is_media, transcribe  # noqa: E402

# Free hosts cap request bodies and CPU time well below what a laptop allows,
# so the limit is configurable and the deployed value is set lower. The number
# is surfaced in the error message rather than hardcoded into the text, so the
# two can never disagree.
MAX_MB = int(os.getenv("MAX_UPLOAD_MB", "500"))
MAX_BYTES = MAX_MB * 1024 * 1024

app = FastAPI(title="CallPal API")

# Local dev, plus whatever the deployed frontend turns out to be. Vercel gives
# every deployment its own preview URL, so FRONTEND_ORIGIN accepts a
# comma-separated list rather than a single value.
allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *[o.strip() for o in os.getenv("FRONTEND_ORIGIN", "").split(",")],
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin for origin in allowed_origins if origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store.init()


class ChatRequest(BaseModel):
    call_id: str
    question: str


@app.get("/")
def root():
    """A signpost rather than a 404.

    This is an API, so the root has nothing to render — but anyone who opens
    the bare URL out of curiosity lands here, and `{"detail":"Not Found"}` reads
    like something is broken when nothing is. Say what this is and where to go.
    """
    return {
        "service": "CallPal API",
        "docs": "/docs",
        "health": "/health",
        "app": os.getenv("FRONTEND_ORIGIN", "").split(",")[0] or None,
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": active_model() or "not yet resolved", **store.stats()}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """Read the upload, then hand the slow part to a worker thread.

    This endpoint has to be `async` because reading an upload is awaited, but
    everything after that — transcription, PDF parsing, the model call — is
    ordinary blocking code. Running it inline held the event loop for the whole
    analysis, which on a single-worker instance means the server answers nothing
    else for a minute: `/health` times out and the app tells the user the API is
    down *while it is busy serving them*.

    `run_in_threadpool` is what FastAPI already does for plain `def` endpoints;
    this just applies it to the blocking half of an async one.
    """
    raw = await file.read()
    name = file.filename or "upload.txt"

    if not raw:
        raise HTTPException(status_code=400, detail="That file is empty.")

    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"That file is larger than the {MAX_MB}MB limit.",
        )

    return await run_in_threadpool(_analyze_upload, name, raw)


def _analyze_upload(name: str, raw: bytes) -> dict:
    source = "transcript"

    # Audio and video are transcribed first, then follow the identical path as
    # an uploaded transcript.
    if is_media(name):
        source = "media"
        try:
            text = clean(transcribe(name, raw))
        except (MissingKey, BadKey) as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except TimeoutError as exc:
            raise HTTPException(status_code=504, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Could not transcribe that recording: {str(exc)[:180]}",
            ) from exc
    else:
        try:
            text = clean(extract_text(name, raw))
        except UnsupportedFile as exc:
            raise HTTPException(status_code=415, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Could not read text out of that file: {str(exc)[:160]}",
            ) from exc

    return _run_analysis(text, source)


def _run_analysis(text: str, source: str) -> dict:
    """Analyze, score the tone arc, store, and return — shared by every route
    that produces a call, whether it was uploaded, transcribed or fetched."""
    if len(text.split()) < 200:
        raise HTTPException(
            status_code=422,
            detail="That does not look like a full earnings call — it contains "
            "under 200 words of usable text.",
        )

    try:
        analysis = analyze_transcript(text)
    except (MissingKey, BadKey) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"The analysis model failed: {str(exc)[:180]}"
        ) from exc

    # Transcripts write dates however they like. Store one canonical form so
    # the calendar and the trend chart do not have to guess.
    analysis["date"] = normalise_date(analysis.get("date", ""))

    # Tone arc across the call. Never fatal — returns [] if it cannot be built.
    analysis["timeline"] = sentiment_timeline(text)

    call_id = uuid.uuid4().hex[:12]
    chunks = chunk(text)
    store.save(call_id, analysis, chunks, text, source)

    analysis["call_id"] = call_id
    analysis["source"] = source
    analysis["word_count"] = len(text.split())

    return analysis


@app.post("/chat")
def chat(request: ChatRequest):
    call = store.get(request.call_id)

    if not call:
        raise HTTPException(
            status_code=404,
            detail="That call is not in the library. Upload the transcript again.",
        )

    question = request.question.strip()

    if not question:
        raise HTTPException(status_code=400, detail="Ask a question first.")

    try:
        return answer_question(question, call["chunks"], call.get("analysis"))
    except (MissingKey, BadKey) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"The model failed to answer: {str(exc)[:180]}"
        ) from exc


@app.get("/calls")
def calls():
    return {"calls": store.recent()}


@app.get("/calls/{call_id}")
def one_call(call_id: str):
    call = store.get(call_id)

    if not call:
        raise HTTPException(status_code=404, detail="No such call.")

    analysis = call["analysis"]
    analysis["call_id"] = call_id
    analysis["source"] = call["source"]
    analysis["word_count"] = len(call["transcript"].split())

    return analysis


@app.get("/calls/{call_id}/transcript")
def transcript(call_id: str):
    call = store.get(call_id)

    if not call:
        raise HTTPException(status_code=404, detail="No such call.")

    return {"call_id": call_id, "text": call["transcript"]}


@app.delete("/calls/{call_id}")
def remove(call_id: str):
    if not store.delete(call_id):
        raise HTTPException(status_code=404, detail="No such call.")

    return {"deleted": call_id}


@app.get("/stats")
def stats():
    return store.stats()


@app.get("/diag/provider")
def diag_provider():
    """What the data provider actually says, verbatim.

    Added because the app was reporting "your 25 daily requests are used up" to
    someone who had not made a request in two days. That message is CallPal's
    interpretation of a sentence the provider sent, and an interpretation is a
    guess until you read the original.

    This makes one real request and returns the raw reply. The key itself is
    never included — only its length and shape, which is enough to tell a
    correct key from a truncated one, a placeholder, or one with a stray space.
    """
    import json
    import urllib.parse
    import urllib.request

    from config import setting

    key = setting("ALPHAVANTAGE_API_KEY") or ""

    shape = {
        "key_present": bool(key),
        "key_length": len(key),
        "key_is_alnum": key.isalnum() if key else False,
        "key_has_whitespace": key != key.strip(),
        "looks_like_placeholder": key.lower() in {"demo", "your-key-here", "changeme"},
    }

    if not key:
        return {"key": shape, "provider": "no key configured"}

    url = "https://www.alphavantage.co/query?" + urllib.parse.urlencode(
        {"function": "SYMBOL_SEARCH", "keywords": "ibm", "apikey": key}
    )

    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            body = response.read().decode("utf-8", "replace")
    except Exception as exc:  # noqa: BLE001 - the point is to report anything
        return {"key": shape, "provider": f"request failed: {type(exc).__name__}: {exc}"}

    try:
        data = json.loads(body)
    except ValueError:
        return {"key": shape, "provider_raw": body[:400]}

    note = data.get("Information") or data.get("Note") or data.get("Error Message")

    return {
        "key": shape,
        "provider_keys": list(data.keys())[:6],
        "provider_message": note,
        "got_results": bool(data.get("bestMatches")),
        # How CallPal classifies that message, so a misclassification is visible
        # rather than hidden behind the friendly wording.
        "callpal_reads_this_as": (
            "ok" if not note else _classify(note)
        ),
    }


def _classify(note: str) -> str:
    try:
        discover._raise_for_note(note)
    except discover.RateLimited:
        return "RateLimited"
    except discover.NoKey:
        return "NoKey"
    except discover.NotAvailable:
        return "NotAvailable"
    return "ok"


@app.get("/notifications")
def notifications():
    """What the bell shows: what is coming up, and what was found.

    Two sources, both real. Upcoming reporting dates come from the provider's
    earnings calendar, limited to tickers this user has actually analyzed —
    a feed of every company on the market is noise, not a notification. The
    rest is drawn from the stored calls: risks flagged, and guidance cut.

    The calendar is best-effort. If the provider is out of quota or has no key,
    that section is simply absent rather than the whole endpoint failing.
    """
    library = store.recent(limit=60)

    tickers = [c["ticker"] for c in library if c.get("ticker")]
    upcoming = discover.upcoming(tickers) if discover.configured() else []

    items = []

    for row in upcoming:
        days = row["days_away"]

        if days == 0:
            when = "reports today"
        elif days == 1:
            when = "reports tomorrow"
        else:
            when = f"reports in {days} days"

        items.append(
            {
                "kind": "upcoming",
                "title": f"{row['symbol']} {when}",
                "detail": row["name"] or "",
                "date": row["date"],
                "call_id": None,
            }
        )

    # Guidance being cut is the single most consequential thing on a call, so it
    # outranks individual risk flags.
    for call in library:
        if (call.get("guidance") or "").lower() == "lowered":
            items.append(
                {
                    "kind": "guidance",
                    "title": f"{call.get('ticker') or call.get('company')} lowered guidance",
                    "detail": call.get("guidance_summary") or call.get("quarter") or "",
                    "date": call.get("call_date") or "",
                    "call_id": call["id"],
                }
            )

    for call in library:
        for risk in (call.get("risk_flags") or [])[:3]:
            items.append(
                {
                    "kind": "risk",
                    "title": risk,
                    "detail": f"{call.get('ticker') or call.get('company')}"
                    f"{' · ' + call['quarter'] if call.get('quarter') else ''}",
                    "date": call.get("call_date") or "",
                    "call_id": call["id"],
                }
            )

    return {
        "items": items[:14],
        "count": len(items),
        "upcoming_available": bool(upcoming),
    }


@app.get("/search")
def search(q: str):
    """Company lookup for the search bar.

    No longer gated on an Alpha Vantage key: lookup goes through Yahoo, which
    needs no key and has no daily cap. The key is only needed to *fetch* a
    transcript, which is one request per analysis rather than one per keystroke.
    """
    try:
        return {"results": discover.search(q), "enabled": True}
    except discover.RateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Company search is unavailable: {str(exc)[:160]}"
        ) from exc


@app.post("/analyze/{symbol}")
def analyze_symbol(symbol: str, quarter: str | None = None):
    """Fetch a published transcript and run the same analysis as an upload."""
    try:
        found = (
            discover.transcript(symbol, quarter)
            if quarter
            else discover.latest_transcript(symbol)
        )
    except discover.NoKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except discover.RateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except discover.NotAvailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"Could not fetch that transcript: {str(exc)[:160]}"
        ) from exc

    return _run_analysis(clean(found["text"]), source="fetched")


@app.get("/prices")
def prices(ticker: str, call_date: str | None = None):
    from prices import price_reaction

    result = price_reaction(ticker, call_date)

    if not result:
        raise HTTPException(
            status_code=404,
            detail=f"No market data for {ticker}. It may be private, "
            "foreign-listed or fictional.",
        )

    return result


@app.get("/models")
def models():
    """Which models this key can reach. Diagnostic only."""
    from analyzer import list_models

    try:
        return {"models": list_models()}
    except MissingKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
