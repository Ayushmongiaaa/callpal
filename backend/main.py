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


@app.get("/health")
def health():
    return {"status": "ok", "model": active_model() or "not yet resolved", **store.stats()}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    raw = await file.read()
    name = file.filename or "upload.txt"

    if not raw:
        raise HTTPException(status_code=400, detail="That file is empty.")

    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"That file is larger than the {MAX_MB}MB limit.",
        )

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


@app.get("/search")
def search(q: str):
    """Company lookup for the search bar."""
    if not discover.configured():
        return {"results": [], "enabled": False}

    try:
        return {"results": discover.search(q), "enabled": True}
    except discover.NoKey as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
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
