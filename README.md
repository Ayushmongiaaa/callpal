# CallPal

Upload an earnings call — a transcript or the raw recording — and get a
structured read of it: what management guided to, how their tone moved through
the call, what risks came up, and how the stock actually reacted. Then ask
questions about it and get answers quoted from the transcript.

Built with React and FastAPI. Google Gemini does the language work.

---

## Why I built it

Earnings calls are an hour long and mostly filler. The interesting parts are
whether guidance moved, what management hedged on, and where the tone changed
when analysts started pushing. Those are all in the transcript, but finding them
means reading the whole thing.

The harder problem is not summarising — it is not making things up. An analysis
tool that invents a revenue figure is worse than no tool, so most of the design
here is about keeping the model tied to the text.

---

## What it does

**Finds the call for you.** Type a company name or ticker in the search bar and
CallPal looks up the ticker, walks back through recent quarters until it finds a
published transcript, and analyzes it — no file to hunt down. Backed by Alpha
Vantage's free tier, which allows roughly 25 requests a day, so lookups are
debounced and cached rather than fired per keystroke.

**Takes the call in whatever form you have it.** PDF, DOCX, TXT and Markdown are
parsed for text. MP3, WAV, M4A, AAC, OGG, FLAC, MP4, MOV and WEBM are transcribed
by Gemini first — speaker-labelled, with the prepared remarks and Q&A marked —
and then follow the identical path as an uploaded transcript. The analysis
problem is solved once, not twice.

Video gets one extra step. The model samples video at roughly a frame a second,
and each frame costs far more than a second of audio, so an hour-long video
overruns the context window on its own while an hour of audio fits comfortably.
Since nothing in an earnings call lives in the picture, `media.py` strips the
audio track out with ffmpeg first — mono, 16kHz — which turns an hour of video
into about 20MB of audio. ffmpeg is resolved from the system first and falls back
to the `imageio-ffmpeg` pip package, which ships a static binary, so `pip install
-r requirements.txt` is enough and Homebrew is not required. If neither is
present the app says so plainly rather than failing mid-request.

**Pulls out what happened.** Company, ticker, quarter and date are read from the
transcript, never assumed. Guidance direction is one of Raised, Maintained,
Lowered or Not Given. Sentiment is scored 0–100 on management's tone — not on the
share price, which is a different thing.

**Takes the call apart the way it was structured.** Every earnings call runs the
same order — safe harbor, the chief executive's framing of the quarter, the
finance chief's numbers, guidance for what comes next, then analysts pushing in
Q&A. CallPal splits the transcript along those lines: who spoke and in what
role, what management credited or blamed, the stated figures (revenue, growth,
EPS, margins, cash flow, debt), guidance for next quarter and the full year, and
the Q&A exchanges — each marked Direct, Partial or Deflected depending on
whether the answer addressed what was actually asked.

Figures management did not state are simply absent, and the panel says how many
were missing. A blank is honest; a computed number would not be, and the
prompt is explicit that nothing may be estimated or recalled.

**Charts the tone across the call.** The transcript is cut into twelve ordered
slices and each one is scored separately. That produces a real arc: confident
prepared remarks, then usually a dip once the analysts start asking. The point
where Q&A begins is marked on the chart.

**Shows what the market did.** Daily OHLC candles from Yahoo Finance around the
call date, with the call marked, so the gap and the move after it are visible.
When a ticker has no market data — private, foreign-listed or fictional — the
chart says so rather than inventing a line.

**Answers questions from the transcript only.** Ask "what did they say about
margins" and the answer comes back with the passage it came from. If the
transcript does not contain the answer, it says so instead of guessing.

**Keeps everything.** Calls are stored in SQLite, so the library survives a
restart — which matters on a free host that sleeps constantly. Reopen an old
call, compare two side by side, or see them all on a timeline.

---

## Keeping the model honest

This is the part I spent the most time on.

**Every claim carries its source.** Each bullish and bearish point must come back
with the speaker, the section, and a verbatim excerpt from the transcript. The
prompt is explicit: *if you cannot ground a point in a real excerpt, leave that
point out entirely.* Clicking a takeaway in the UI expands it to show who said it
and what they actually said.

**Structured output, not prose.** Both Gemini calls use `response_schema`, so the
model returns typed JSON matching a schema rather than paragraphs that need
parsing. Fields it cannot fill come back empty rather than plausible.

**Retrieval before answering.** Questions are not sent with the whole
transcript. The transcript is chunked with overlap, chunks are ranked by keyword
overlap with the question, and only the top passages are sent — numbered, so the
model can cite them back. Keyword ranking rather than embeddings is a deliberate
trade: it costs nothing, needs no vector store, and on a single document it works
well enough.

**Testing whether it reads or recalls.** Gemini has memorised real earnings
calls, so a correct answer on an NVIDIA transcript proves nothing. I wrote a
transcript for a company that does not exist — Northwind Robotics (NWRB) — with a
forward guidance figure ($465.0M) deliberately different from the reported
quarter ($412M). It extracted the fictional ticker, the correct guidance
direction and the forward figure rather than the reported one. It was reading.

---

## Running it

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then paste your key into it
uvicorn main:app --reload
```

The key is a free Gemini API key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey). Either key
format works — see the note on authentication schemes below. It is read from
`backend/.env`, which is gitignored and never committed.

Two optional extras go in the same file. `ALPHAVANTAGE_API_KEY`
([free key here](https://www.alphavantage.co/support/#api-key)) turns on the
company search bar; without it uploading still works and the search box says so.
ffmpeg arrives with `requirements.txt`, so video uploads work out of the box.

**Frontend**

```bash
npm install
npm run dev
```

Open http://localhost:5173. Two sample transcripts ship in `public/` — one is
draggable straight into the upload card from the corner of the page.

**Tests**

```bash
cd backend && python test_api.py
```

46 checks covering file routing, PDF extraction, audio being sent for
transcription rather than parsed as text, persistence across a restart, deletion,
ticker validation, the quarter walk-back, a real video being reduced to a real
MP3, and every error path a user can hit. The model calls and the data provider
are stubbed — these test the plumbing around them, which is what breaks silently.

---

## How it fits together

```
React (Vite)                    FastAPI
──────────────                  ─────────────────────────────────
SearchBar       ──query──▶      GET  /search     ticker lookup
                ──ticker─▶      POST /analyze/{sym}
                                  └─ discover.py  fetch published transcript
UploadCard      ──file──▶       POST /analyze
                                  ├─ media.py     audio/video → transcript
                                  ├─ extractor.py PDF/DOCX/TXT → text
                                  ├─ analyzer.py  → structured JSON
                                  ├─ analyzer.py  → 12-segment tone timeline
                                  └─ store.py     → SQLite
Dashboard       ◀─analysis──
CandleChart     ──ticker─▶       GET  /prices     yfinance OHLC
CallAssistant   ──question▶      POST /chat       retrieve → answer → cite
Calls/Compare   ──────────▶      GET  /calls      the stored library
```

| File | What it does |
|---|---|
| `backend/main.py` | Routes, validation, HTTP error mapping |
| `backend/analyzer.py` | Gemini calls, schemas, prompts, retrieval |
| `backend/media.py` | Audio and video transcription, ffmpeg audio extraction |
| `backend/discover.py` | Company search and transcript lookup |
| `backend/extractor.py` | Text out of PDF/DOCX/TXT, chunking |
| `backend/store.py` | SQLite persistence |
| `backend/prices.py` | Yahoo Finance OHLC and the one-day reaction |
| `src/hooks/useCallPal.js` | All app state in one place |
| `src/components/CandleChart.jsx` | Hand-built candlesticks on Recharts |
| `src/components/SearchBar.jsx` | Debounced company search with a results panel |
| `src/pages/Pages.jsx` | Calls, Watchlist, Calendar, Insights, Trends, Alerts, Compare |

---

## Decisions worth explaining

**Model fallback instead of a hardcoded model name.** Free-tier Gemini
availability moves — `gemini-2.0-flash` reported a zero quota on my project and
`gemini-2.5-flash` was closed to new users partway through building this. So
`analyzer.py` holds an ordered list of candidates and falls through on 404 or 429
only, caching the first that works. A genuine bug still raises immediately rather
than being retried six times.

**Defensive parsing of the transcript provider.** The response is documented as
a list of speaker turns, but providers reshape their payloads without notice, so
`_flatten` accepts a list of turns, a bare string, or a wrapped object, and
returns empty rather than throwing on anything else. Alpha Vantage also returns
HTTP 200 for being out of quota — the failure arrives as an `Information` key in
the body — so status codes are not trusted there.

**Two authentication schemes, tried in order.** Google is midway through
changing its API key format. Old keys ("AIza...") are sent in an `x-goog-api-key`
header; newer ones ("AQ.Ab8...") are OAuth-style tokens that want
`Authorization: Bearer`. Sent the wrong way, a perfectly valid key comes back
`401 UNAUTHENTICATED — Expected OAuth 2 access token`, which reads like an OAuth
misconfiguration and is not one. Rather than sniff the prefix and hope, the
client tries the standard scheme, retries once as a bearer token, and caches
whichever worked. This cost me an afternoon; the error message was actively
misleading.

**Restraint in the interface, on purpose.** The first pass applied the same
treatment to every surface — violet gradient, heavy blur, glow — which is the
signature of generated UI: when every panel shouts equally, nothing is
emphasised and the decoration stops carrying meaning. The glass treatment is now
reserved for the hero card, the upload target and the sidebar, so it reads as
"look here" rather than "this is a div". Hierarchy comes from a type scale
instead, and every figure is set in a tabular-numeral face so columns of numbers
line up — the fastest way to look approximate in a product about financial data
is digits that do not stack.

**Keyword retrieval, not embeddings.** A vector store for a single document is
overhead without a payoff. Keyword overlap ranks passages well enough on one
transcript and costs nothing to run.

**Degrade honestly.** No market data for a ticker returns 404 and the UI says why,
rather than drawing an empty chart. A call too short to score section by section
says that instead of drawing a flat line. Guidance is categorical, so the
Guidance card lights the step management took rather than showing a bar chart
that means nothing.

**The sample transcripts are condensed and labelled as such.** They paraphrase
publicly reported results for demonstration; they are not verbatim copies of
anyone's call.

---

## Replacing the logo

Drop a file at `public/logo.svg` (or `logo.png`) and it is picked up
automatically — `BrandMark` tries those two paths and falls back to the built-in
waveform mark if neither exists, so a missing file never shows as a broken
image.

| | |
|---|---|
| **Format** | SVG preferred. It stays crisp at any size and weighs almost nothing. PNG works. |
| **Canvas** | Square. 256×256 for PNG — it renders at 32px, so that leaves headroom for high-density screens. |
| **Background** | Transparent. The mark sits inside the violet rounded tile, so its own background would show as a square inside a square. |
| **Colour** | Light — near-white or a pale tint. The tile behind it is deep violet. |
| **Padding** | None needed; the component insets it by 5px. Design edge to edge. |

The browser tab icon is separate: `public/favicon.svg`, 64×64, with its own
background since nothing sits behind it.

---

## Deploying it

The API runs on Render and the frontend on Vercel, both on free tiers.

`render.yaml` describes the API service. Three environment variables are set in
the Render dashboard rather than committed: `GEMINI_API_KEY`,
`ALPHAVANTAGE_API_KEY`, and `FRONTEND_ORIGIN` (the Vercel URL, which the API
uses for CORS). On Vercel, set `VITE_API_URL` to the Render URL.

Two things about the free tier are worth stating plainly rather than papering
over:

**The API sleeps.** A free Render instance shuts down after inactivity and takes
30–60 seconds to wake. The frontend's HTTP timeout is set generously for this
reason, so a cold start reads as slow rather than broken.

**The database is ephemeral.** Free instances have no persistent disk, so the
SQLite file is rebuilt empty whenever the instance restarts. Locally, and on any
plan with a disk attached, calls persist exactly as designed — the storage layer
is unchanged either way. Attaching a disk is a few lines in `render.yaml`.

`MAX_UPLOAD_MB` is set to 25 in production. A free instance should not be asked
to hold a half-gigabyte upload in memory, and the error message reads the limit
from the same variable so the two cannot drift apart.

---

## Limitations

- Analysis is AI-generated and can be wrong. It is not investment advice, and the
  app says so on every screen.
- Very long calls are trimmed to roughly the first 60,000 words before analysis.
- Transcription quality on poor audio is only as good as the model's.
- Company search depends on Alpha Vantage's free tier, which allows about 25
  requests a day and does not have a transcript for every company or quarter.
- SQLite is single-file storage — fine for one user, not for concurrent writers.
