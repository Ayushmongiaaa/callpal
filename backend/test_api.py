"""End-to-end tests for the CallPal API.

Run with:  python test_api.py

The Gemini calls are stubbed out. That is deliberate: these tests are about
everything *around* the model — file routing, PDF and DOCX extraction, audio
being sent for transcription rather than parsed as text, SQLite persistence,
reopening a stored call, transcripts surviving a restart, deletion, and the
error paths a user can actually hit. Those are the parts that break silently.
Model quality is checked by hand against real transcripts.

A temporary database is used, so running the tests never touches callpal.db.
"""

import os
import sys
import tempfile
import textwrap

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

sys.path.insert(0, HERE)

os.environ.setdefault("GEMINI_API_KEY", "stub-key-for-tests")
os.environ["CALLPAL_DB"] = tempfile.mktemp(suffix=".db")

import analyzer  # noqa: E402
import media  # noqa: E402

SAMPLE_TXT = os.path.join(ROOT, "public", "sample-tsla-q1-2024.txt")
SAMPLE_TXT_2 = os.path.join(ROOT, "public", "sample-nvda-q2-fy2025.txt")

FAKE_ANALYSIS = {
    "company": "Tesla, Inc.",
    "ticker": "TSLA",
    "website": "tesla.com",
    "quarter": "Q1 2024",
    "date": "2024-04-23",
    "summary": "Deliveries fell and margins compressed.",
    "sentiment": {"score": 44, "label": "Neutral"},
    "guidance": {"direction": "Lowered", "summary": "Growth notably lower."},
    "revenue_outlook": "",
    "risk_flags": ["Margin pressure", "Price cuts"],
    "bullish_points": [
        {
            "text": "Record energy storage deployment",
            "source": {
                "speaker": "CFO",
                "section": "Prepared Remarks",
                "excerpt": "Energy storage deployments reached a record.",
            },
        }
    ],
    "bearish_points": [],
}


def fake_timeline(_text, segments=12):
    return [
        {
            "index": i,
            "position": round((i + 0.5) / segments * 100),
            "score": 70 - i * 3,
            "section": "Prepared Remarks" if i < segments // 2 else "Q&A",
            "note": "note",
        }
        for i in range(segments)
    ]


analyzer.analyze_transcript = lambda text: dict(FAKE_ANALYSIS)
analyzer.sentiment_timeline = fake_timeline
analyzer.answer_question = lambda q, chunks, analysis=None: {
    "answer": "Stubbed answer.",
    "used_passages": [0],
    "grounded": True,
    "citations": [{"index": 0, "excerpt": chunks[0][:80]}],
}

# An "upload" of audio should reach the transcriber, not the text extractor.
media.transcribe = lambda name, raw: open(SAMPLE_TXT_2).read()

import main  # noqa: E402

main.analyze_transcript = analyzer.analyze_transcript
main.sentiment_timeline = analyzer.sentiment_timeline
main.answer_question = analyzer.answer_question

from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app)

PASSED = 0
FAILED = 0


def check(label, condition, detail=""):
    global PASSED, FAILED
    if condition:
        PASSED += 1
        print(f"  pass  {label}")
    else:
        FAILED += 1
        print(f"  FAIL  {label}  {detail}")


def build_pdf(path):
    """A real PDF built from the sample transcript, so extraction is tested
    against a genuine PDF rather than a hand-faked byte string."""
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
    except ImportError:
        return None

    text = open(SAMPLE_TXT).read()
    pdf = canvas.Canvas(path, pagesize=letter)
    y = 760

    for para in text.split("\n"):
        for line in textwrap.wrap(para, 95) or [""]:
            if y < 50:
                pdf.showPage()
                y = 760
            pdf.setFont("Helvetica", 9)
            pdf.drawString(45, y, line)
            y -= 12

    pdf.save()
    return path


def main_tests():
    txt = open(SAMPLE_TXT_2, "rb").read()
    expected_words = len(open(SAMPLE_TXT).read().split())

    print("\nUploads")

    pdf_path = build_pdf(tempfile.mktemp(suffix=".pdf"))
    pdf_id = None

    if pdf_path:
        r = client.post(
            "/analyze",
            files={"file": ("call.pdf", open(pdf_path, "rb").read(), "application/pdf")},
        )
        check("a real PDF is accepted", r.status_code == 200, r.text[:120])

        if r.status_code == 200:
            body = r.json()
            pdf_id = body["call_id"]
            check(
                "no words are lost extracting the PDF",
                body["word_count"] == expected_words,
                f'{body["word_count"]} vs {expected_words}',
            )
            check("a sentiment timeline is attached", len(body["timeline"]) == 12)
            check("source is recorded as transcript", body["source"] == "transcript")
    else:
        print("  skip  PDF tests (reportlab not installed)")

    r = client.post("/analyze", files={"file": ("call.txt", txt, "text/plain")})
    check("a TXT transcript is accepted", r.status_code == 200, r.text[:120])
    txt_id = r.json().get("call_id") if r.status_code == 200 else None

    r = client.post("/analyze", files={"file": ("call.mp3", b"\x00" * 5000, "audio/mpeg")})
    check("audio is sent for transcription", r.status_code == 200, r.text[:120])
    check("audio uploads are marked as media", r.json().get("source") == "media")

    r = client.post("/analyze", files={"file": ("call.mov", b"\x00" * 5000, "video/quicktime")})
    check("video is sent for transcription", r.status_code == 200, r.text[:120])

    print("\nRejections")

    r = client.post("/analyze", files={"file": ("notes.zip", b"x" * 5000, "application/zip")})
    check("an unsupported type is refused", r.status_code == 415, r.status_code)

    r = client.post("/analyze", files={"file": ("empty.txt", b"", "text/plain")})
    check("an empty file is refused", r.status_code == 400, r.status_code)

    r = client.post("/analyze", files={"file": ("short.txt", b"not a call", "text/plain")})
    check("something too short to be a call is refused", r.status_code == 422, r.status_code)

    print("\nPersistence")

    library = client.get("/calls").json()["calls"]
    check("every stored call is listed", len(library) >= 3, len(library))
    check("both sources appear", {c["source"] for c in library} == {"transcript", "media"})
    check("the call date is stored", library[0]["call_date"] == "2024-04-23")

    target = pdf_id or txt_id
    stored = client.get(f"/calls/{target}").json()
    check("reopening returns the full analysis", stored["company"] == "Tesla, Inc.")
    check("the timeline survives the round trip", len(stored.get("timeline", [])) == 12)
    check("risk flags survive", stored["risk_flags"] == ["Margin pressure", "Price cuts"])
    check(
        "quoted evidence survives",
        stored["bullish_points"][0]["source"]["speaker"] == "CFO",
    )

    body = client.get(f"/calls/{target}/transcript").json()["text"]
    check("the transcript itself is kept", len(body.split()) > 100, len(body.split()))

    print("\nChat")

    r = client.post("/chat", json={"call_id": target, "question": "How were margins?"})
    check("a question about a stored call is answered", r.status_code == 200)
    check("the answer carries a citation", len(r.json().get("citations", [])) == 1)

    r = client.post("/chat", json={"call_id": "nosuchcall", "question": "x"})
    check("asking about an unknown call 404s", r.status_code == 404)

    r = client.post("/chat", json={"call_id": target, "question": "   "})
    check("an empty question is refused", r.status_code == 400)

    print("\nStats and deletion")

    stats = client.get("/stats").json()
    check("stats count the stored calls", stats["calls"] == len(library), stats)

    if txt_id:
        check("a call can be deleted", client.delete(f"/calls/{txt_id}").status_code == 200)
        check("it disappears from the library", client.get(f"/calls/{txt_id}").status_code == 404)
        check("deleting it twice 404s", client.delete(f"/calls/{txt_id}").status_code == 404)

    print("\nCompany search")

    import config
    import discover

    # These tests must not read whatever is in the developer's real .env, or
    # they would pass or fail depending on whose machine they run on — and the
    # unconfigured case could reach the network for real.
    os.environ.pop("ALPHAVANTAGE_API_KEY", None)
    config.ENV_PATH = os.path.join(tempfile.mkdtemp(), "absent.env")

    r = client.get("/search", params={"q": "nvidia"})
    check("search answers even with no provider key", r.status_code == 200, r.status_code)
    # Search is no longer gated on an Alpha Vantage key — it goes through Yahoo,
    # which needs none. It reports itself enabled even with no key configured,
    # because it genuinely is.
    check("and is enabled without a key", r.json().get("enabled") is True)

    # The provider is stubbed here — these check our parsing and quarter walk,
    # not their servers.
    discover._cache.clear()
    calls_made = []

    def fake_get(params):
        calls_made.append(params)

        if params["function"] == "SYMBOL_SEARCH":
            return {
                "bestMatches": [
                    {
                        "1. symbol": "NVDA", "2. name": "NVIDIA Corporation",
                        "3. type": "Equity", "4. region": "United States",
                        "8. currency": "USD", "9. matchScore": "0.9",
                    },
                    {
                        "1. symbol": "NVD.DEX", "2. name": "NVIDIA (Frankfurt)",
                        "3. type": "Equity", "4. region": "Germany",
                        "8. currency": "EUR", "9. matchScore": "0.8",
                    },
                ]
            }

        # Nothing published for the newest quarter — the walk-back must handle it.
        if params.get("quarter") == discover.recent_quarters(1)[0]:
            return {"transcript": []}

        return {
            "transcript": [
                {"speaker": "Jensen Huang", "title": "CEO", "content": "Demand is strong. " * 60},
                {"speaker": "Colette Kress", "title": "CFO", "content": "Revenue grew. " * 60},
            ]
        }

    discover._get = fake_get

    # Company search goes through Yahoo now — no key, no daily cap — so the
    # provider is stubbed the same way the transcript endpoint is.
    import sys
    import types

    class FakeYahooSearch:
        def __init__(self, query, **kwargs):
            self.quotes = [
                {"symbol": "NVDA", "shortname": "NVIDIA Corporation",
                 "quoteType": "EQUITY", "exchDisp": "NasdaqGS"},
                {"symbol": "NVD.DE", "shortname": "NVIDIA (Frankfurt)",
                 "quoteType": "EQUITY", "exchDisp": "XETRA"},
                {"symbol": "SPY", "shortname": "SPDR S&P 500 ETF",
                 "quoteType": "ETF", "exchDisp": "NYSEArca"},
            ]

    sys.modules["yfinance"] = types.SimpleNamespace(Search=FakeYahooSearch)
    discover._cache.clear()

    found = discover.search("nvidia")
    check("search returns matches", len(found) == 1, found)
    check("foreign listings are filtered out", found[0]["symbol"] == "NVDA")
    check("funds are filtered out", all(f["symbol"] != "SPY" for f in found))

    # Search must not consume the transcript provider's daily quota.
    before = len(calls_made)
    discover._cache.clear()
    discover.search("nvidia")
    check("search costs no Alpha Vantage requests", len(calls_made) == before)

    # And if Yahoo is unreachable, the search box degrades rather than breaking.
    class BrokenYahoo:
        def __init__(self, *a, **k):
            raise RuntimeError("network unreachable")

    sys.modules["yfinance"] = types.SimpleNamespace(Search=BrokenYahoo)
    discover._cache.clear()
    check("a dead search provider returns empty, not an error",
          discover.search("nvidia") == [])

    sys.modules["yfinance"] = types.SimpleNamespace(Search=FakeYahooSearch)
    discover._cache.clear()

    # Counted from here rather than from the top of the block: the old total
    # silently included a request that company search used to make, so the
    # threshold was measuring two things at once.
    calls_made.clear()
    t = discover.latest_transcript("NVDA")
    check("the walk-back skips an unpublished quarter", len(calls_made) >= 2, len(calls_made))
    check("turns become speaker-labelled text", "JENSEN HUANG (CEO):" in t["text"])
    check("a real quarter is reported", t["quarter"].endswith(("Q1", "Q2", "Q3", "Q4")))

    for bad in ("nvda; drop table", "12345", "toolongtickername"):
        try:
            discover.transcript(bad, "2024Q1")
            check(f"rejects bad ticker {bad!r}", False)
        except discover.NotAvailable:
            check(f"rejects bad ticker {bad!r}", True)

    try:
        discover.transcript("NVDA", "Q1-2024")
        check("rejects a malformed quarter", False)
    except discover.NotAvailable:
        check("rejects a malformed quarter", True)

    r = client.post("/analyze/NVDA")
    check("fetching a ticker runs the full analysis", r.status_code == 200, r.text[:120])
    check("it is recorded as fetched", r.json().get("source") == "fetched")
    check("and it lands in the library", any(
        c["source"] == "fetched" for c in client.get("/calls").json()["calls"]
    ))

    print("\nVideo handling")

    check("video extensions are recognised", media.is_media("call.mov"))

    if media.has_ffmpeg():
        print(f"  info  using ffmpeg at {media.ffmpeg_path()}")

        # A synthetic clip with both a video and an audio stream. Stripping the
        # picture is what keeps an hour-long call inside the model's context.
        import subprocess

        clip = tempfile.mktemp(suffix=".mp4")
        subprocess.run(
            [media.ffmpeg_path(), "-nostdin", "-y",
             "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
             "-f", "lavfi", "-i", "testsrc=size=320x180:rate=25:duration=20",
             "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac",
             clip],
            capture_output=True,
        )

        if os.path.exists(clip):
            video = open(clip, "rb").read()
            audio = media.extract_audio("clip.mp4", video)

            check("the audio comes out of a real video", len(audio) > 1000)
            check("it is an MP3", audio[:3] == b"ID3" or audio[0] == 0xFF)
            check("and it is much smaller than the video", len(audio) < len(video) / 2,
                  f"{len(video)} -> {len(audio)}")
            os.remove(clip)
    else:
        print("  skip  audio extraction (no ffmpeg — run pip install -r requirements.txt)")

    print("\nRestart")

    import importlib

    import store

    importlib.reload(store)
    store.init()
    check("calls survive a fresh connection", len(store.recent()) == len(library))


if __name__ == "__main__":
    main_tests()
    print(f"\n{PASSED} passed, {FAILED} failed")
    sys.exit(1 if FAILED else 0)
