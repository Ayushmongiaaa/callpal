"""Gemini calls for CallPal.

Two jobs live here:

  analyze_transcript  – turn a raw transcript into the structured JSON the
                        dashboard renders
  answer_question     – answer a question using only retrieved passages, and
                        cite them

Both force structured output. The model is never asked for prose, because the
React side renders fields, not paragraphs.
"""

import json
import os
import re

# Model availability moves fast: gemini-2.0-flash reported "limit: 0" free-tier
# quota on this project and gemini-2.5-flash is closed to new users. Rather than
# hardcode one name, try a list in order and remember the first that works.
# Override the whole thing with GEMINI_MODEL in .env.
MODEL_CANDIDATES = [
    m
    for m in [
        os.getenv("GEMINI_MODEL"),
        "gemini-3.5-flash-lite",
        "gemini-3.5-flash",
        "gemini-3.1-flash-lite",
        "gemini-3-flash-preview",
        "gemini-2.5-flash-lite",
        "gemini-2.0-flash-lite",
    ]
    if m
]

_working_model: str | None = None

# None until we learn which header scheme this key wants; then True or False.
_use_bearer: bool | None = None

ANALYSIS_SCHEMA = {
    "type": "object",
    "properties": {
        "company": {"type": "string"},
        "ticker": {"type": "string"},
        "website": {"type": "string"},
        "quarter": {"type": "string"},
        "date": {"type": "string"},
        "summary": {"type": "string"},
        "sentiment": {
            "type": "object",
            "properties": {
                "score": {"type": "integer"},
                "label": {"type": "string"},
            },
            "required": ["score", "label"],
        },
        "guidance": {
            "type": "object",
            "properties": {
                "direction": {"type": "string"},
                "summary": {"type": "string"},
            },
            "required": ["direction", "summary"],
        },
        "revenue_outlook": {"type": "string"},
        "risk_flags": {"type": "array", "items": {"type": "string"}},
        "bullish_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "source": {
                        "type": "object",
                        "properties": {
                            "speaker": {"type": "string"},
                            "section": {"type": "string"},
                            "excerpt": {"type": "string"},
                        },
                        "required": ["speaker", "section", "excerpt"],
                    },
                },
                "required": ["text", "source"],
            },
        },
        "bearish_points": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "source": {
                        "type": "object",
                        "properties": {
                            "speaker": {"type": "string"},
                            "section": {"type": "string"},
                            "excerpt": {"type": "string"},
                        },
                        "required": ["speaker", "section", "excerpt"],
                    },
                },
                "required": ["text", "source"],
            },
        },
        # An earnings call has the same shape every time: opening and safe
        # harbor, financial review, outlook, then Q&A. Pulling the transcript
        # apart along those lines is what turns a summary into something an
        # analyst can actually use.
        "speakers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                },
                "required": ["name", "role"],
            },
        },
        "opening": {
            "type": "object",
            "properties": {
                "safe_harbor": {"type": "boolean"},
                "ceo_summary": {"type": "string"},
                "drivers": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["safe_harbor", "ceo_summary", "drivers"],
        },
        "financials": {
            "type": "object",
            "properties": {
                "revenue": {"type": "string"},
                "revenue_growth": {"type": "string"},
                "net_income": {"type": "string"},
                "eps": {"type": "string"},
                "gross_margin": {"type": "string"},
                "operating_margin": {"type": "string"},
                "free_cash_flow": {"type": "string"},
                "cash_position": {"type": "string"},
                "debt": {"type": "string"},
            },
            "required": [
                "revenue",
                "revenue_growth",
                "net_income",
                "eps",
                "gross_margin",
                "operating_margin",
                "free_cash_flow",
                "cash_position",
                "debt",
            ],
        },
        "outlook": {
            "type": "object",
            "properties": {
                "next_quarter": {"type": "string"},
                "full_year": {"type": "string"},
                "challenges": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["next_quarter", "full_year", "challenges"],
        },
        "qa": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "analyst": {"type": "string"},
                    "firm": {"type": "string"},
                    "question": {"type": "string"},
                    "answer": {"type": "string"},
                    "answered_by": {"type": "string"},
                    "directness": {"type": "string"},
                },
                "required": [
                    "analyst",
                    "question",
                    "answer",
                    "answered_by",
                    "directness",
                ],
            },
        },
    },
    "required": [
        "company",
        "ticker",
        "website",
        "quarter",
        "summary",
        "sentiment",
        "guidance",
        "revenue_outlook",
        "risk_flags",
        "bullish_points",
        "bearish_points",
        "speakers",
        "opening",
        "financials",
        "outlook",
        "qa",
    ],
}

ANALYSIS_PROMPT = """You are analyzing an earnings call transcript.

Return ONLY structured data matching the schema. Rules:

- company, ticker, quarter and date must be taken from the transcript itself.
  If a field genuinely is not stated, use an empty string. Never invent one.
- website is the company's primary domain, lowercase, no scheme and no www —
  for example "nvidia.com" or "tesla.com". This is the one field you may supply
  from general knowledge, because it is used only to fetch a logo. If you are
  not confident of the domain, return an empty string.
- sentiment.score is 0-100 measuring management's tone, not the stock's
  performance. label is one of: Very Negative, Negative, Neutral, Positive,
  Very Positive.
- guidance.direction is exactly one of: Raised, Maintained, Lowered, Not Given.
- revenue_outlook is the forward revenue figure management guided to, formatted
  like "$28.0B". Empty string if none was given.
- risk_flags are short phrases, at most 6.
- bullish_points and bearish_points: 3-5 each. Every single one must carry a
  source with the speaker, the section it came from (Prepared Remarks or Q&A),
  and a verbatim excerpt copied from the transcript. Do not paraphrase the
  excerpt and do not fabricate it. If you cannot ground a point in a real
  excerpt, leave that point out entirely.

Every earnings call follows the same running order, so pull it apart along
those lines:

- speakers: everyone who spoke for the company, with their role as the call
  states it ("Chief Financial Officer", not "CFO" unless that is how they are
  introduced). Do not include analysts here.
- opening.safe_harbor: true if a forward-looking-statements or safe harbor
  disclaimer was read.
- opening.ceo_summary: two or three sentences on what the chief executive said
  the quarter was about.
- opening.drivers: the specific things management credited or blamed for the
  results — at most 5 short phrases.
- financials: the figures as management stated them, formatted as they said
  them ("$46.7B", "+56% YoY", "73.4%", "$1.05"). Every one of these is an empty
  string unless the number is actually in the transcript. Never compute,
  estimate or recall a figure. revenue_growth is the year-over-year change.
- outlook.next_quarter and outlook.full_year: what management guided to for
  each, in their words. Empty string if not given.
- outlook.challenges: risks or headwinds management raised about the period
  ahead, at most 5.
- qa: up to 6 exchanges from the question and answer session. analyst is the
  person asking and firm is their employer if stated. question and answer are
  short faithful summaries, not transcripts. answered_by is the executive who
  replied. directness is exactly one of: Direct, Partial, Deflected — judged on
  whether the answer addressed what was actually asked. If the call has no Q&A
  section, return an empty array.

Transcript:
---
{transcript}
---"""

TIMELINE_SCHEMA = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "score": {"type": "integer"},
                    "section": {"type": "string"},
                    "note": {"type": "string"},
                },
                "required": ["index", "score", "section", "note"],
            },
        }
    },
    "required": ["segments"],
}

TIMELINE_PROMPT = """Score the tone of each numbered segment of this earnings call.

For every segment return:
- index: the segment number exactly as given
- score: 0-100 for how confident and positive management sounds in that segment
  specifically. This measures tone, not share price. Defensive or hedging
  answers should score lower than confident ones.
- section: "Prepared Remarks", "Q&A", or "Other"
- note: at most 6 words on what drives that score

Score every segment. Do not skip any.

Segments:
{segments}"""


ANSWER_PROMPT = """You are answering a question about one specific earnings call.

Use ONLY the material below: the extracted summary of this call, and the
transcript passages. Never use outside knowledge about the company.

How to answer:

- Be substantive. Give the actual figures, directions and names from the call
  rather than a one-line dismissal. Aim for 60-150 words.
- Quote or paraphrase what management actually said, and say who said it when
  the passage names the speaker.
- If the passages do not fully answer the question, say what the call DOES tell
  you about it before noting what is missing. "The passages do not contain
  that" on its own is not a useful answer when related material is right there.
- Only say the call does not address something when there is genuinely nothing
  relevant in either the summary or the passages.
- Do not invent numbers. Every figure must appear in the material below.

After the answer, list the passage numbers you actually used.

What this call is:
{summary}

Question: {question}

Transcript passages:
{passages}"""

ANSWER_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "used_passages": {"type": "array", "items": {"type": "integer"}},
        "grounded": {"type": "boolean"},
    },
    "required": ["answer", "used_passages", "grounded"],
}


class MissingKey(Exception):
    pass


class BadKey(Exception):
    pass


def _explain(error: Exception) -> Exception | None:
    """Turn provider auth errors into something a human can act on.

    Google is midway through changing its key format: new keys are issued with
    an "AQ." prefix, and those are currently rejected by the Generative
    Language endpoint this SDK talks to. The raw error says "Expected OAuth 2
    access token", which sends people looking for an OAuth bug that is not
    there — the actual fix is to issue a key in the older format.
    """
    text = str(error)

    if "401" not in text and "UNAUTHENTICATED" not in text:
        return None

    from config import setting

    if setting("GEMINI_API_KEY").startswith("AQ."):
        return BadKey(
            "Google rejected the API key, both as an API key and as a bearer "
            "token. Keys beginning with 'AQ.' are Google's new format and are "
            "not accepted by this API on every account yet. Either try a key "
            "from a different Google account, or switch CallPal to another "
            "free provider — see the README."
        )

    return BadKey(
        "Google rejected the API key. Check GEMINI_API_KEY in backend/.env — "
        "it may be expired, revoked, or copied incompletely."
    )


def _client(bearer: bool = False):
    """A Gemini client, authenticated the way this particular key expects.

    Google is midway through changing key formats. Old keys ("AIza...") go in
    an x-goog-api-key header, which is what the SDK does by default. Newer keys
    ("AQ.Ab8...") are OAuth-style tokens and want an Authorization: Bearer
    header instead — sent the default way they come back 401 with a message
    about an "OAuth 2 access token", which is confusing but is really just the
    server saying the header is wrong.

    Rather than guess from the prefix, `_generate` tries the normal path first
    and retries as a bearer token once if that is rejected.
    """
    from config import setting

    key = setting("GEMINI_API_KEY")

    if not key:
        raise MissingKey(
            "GEMINI_API_KEY is not set. Copy backend/.env.example to "
            "backend/.env and paste your key from aistudio.google.com/apikey."
        )

    from google import genai
    from google.genai import types

    if bearer:
        return genai.Client(
            api_key=key,
            http_options=types.HttpOptions(
                headers={"Authorization": f"Bearer {key}"}
            ),
        )

    return genai.Client(api_key=key)


def auth_schemes() -> list[bool]:
    """Header schemes to try, best guess first.

    Once one has worked anywhere in the app, every other caller uses it
    directly — there is no reason for the transcriber to rediscover what the
    analyzer already learned.
    """
    return [_use_bearer] if _use_bearer is not None else [False, True]


def remember_scheme(bearer: bool) -> None:
    global _use_bearer
    _use_bearer = bearer


def list_models() -> list[str]:
    """Model names this key can call, filtered to ones that generate content."""
    client = _client()

    names = []
    for model in client.models.list():
        actions = getattr(model, "supported_actions", None) or []
        if not actions or "generateContent" in actions:
            names.append(model.name.replace("models/", ""))

    return sorted(names)


def _generate(prompt: str, schema: dict) -> dict:
    """Call the first candidate model that this key can actually use.

    Free-tier availability shifts, so a 404 (model retired) or 429 (no quota on
    this model) falls through to the next candidate instead of failing the whole
    request. The winner is cached so later calls go straight to it.
    """
    global _working_model, _use_bearer

    from google.genai import types

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=schema,
        temperature=0.2,
    )

    order = (
        [_working_model] + [m for m in MODEL_CANDIDATES if m != _working_model]
        if _working_model
        else MODEL_CANDIDATES
    )

    problems = []
    auth_error = None

    # Try the standard header scheme, then the bearer one. Whichever works is
    # remembered so later calls go straight to it.
    schemes = [_use_bearer] if _use_bearer is not None else [False, True]

    for bearer in schemes:
        client = _client(bearer=bearer)

        for name in order:
            try:
                response = client.models.generate_content(
                    model=name, contents=prompt, config=config
                )
                _working_model = name
                _use_bearer = bearer
                return json.loads(response.text)
            except Exception as exc:
                text = str(exc)

                # An auth failure is the same on every model, so stop trying
                # models and move on to the other header scheme instead of
                # reporting six identical rejections.
                if "401" in text or "UNAUTHENTICATED" in text:
                    auth_error = exc
                    break

                problems.append(f"{name}: {text[:90]}")

                # Only skip to the next model for availability/quota problems.
                # A genuine bug should surface immediately rather than be
                # retried six times.
                if not any(
                    code in text
                    for code in ("404", "429", "NOT_FOUND", "RESOURCE_EXHAUSTED")
                ):
                    raise

    if auth_error is not None:
        raise _explain(auth_error) from auth_error

    raise RuntimeError("No available Gemini model. Tried — " + " | ".join(problems))


def active_model() -> str | None:
    return _working_model


def analyze_transcript(transcript: str) -> dict:
    # Long calls exceed a comfortable single request; the first ~60k words hold
    # the prepared remarks and most of the Q&A.
    words = transcript.split()
    trimmed = " ".join(words[:60000])

    return _generate(ANALYSIS_PROMPT.format(transcript=trimmed), ANALYSIS_SCHEMA)


def sentiment_timeline(text: str, segments: int = 12) -> list[dict]:
    """Tone across the call, scored segment by segment.

    The transcript is cut into equal ordered slices and the model scores each
    one. That produces a genuine arc — typically confident prepared remarks
    followed by a dip under analyst questioning — rather than a decorative line.
    """
    words = text.split()

    if len(words) < segments * 40:
        return []

    size = len(words) // segments
    slices = [
        " ".join(words[i * size : (i + 1) * size if i < segments - 1 else len(words)])
        for i in range(segments)
    ]

    # Cap each slice so a very long call still fits comfortably in one request.
    prompt_body = "\n\n".join(
        f"[{i}] {s[:2600]}" for i, s in enumerate(slices)
    )

    try:
        result = _generate(
            TIMELINE_PROMPT.format(segments=prompt_body), TIMELINE_SCHEMA
        )
    except Exception:
        # The timeline is a nice-to-have; never fail the whole analysis for it.
        return []

    out = []
    for seg in result.get("segments", []):
        i = seg.get("index")
        if not isinstance(i, int) or not 0 <= i < segments:
            continue
        out.append(
            {
                "index": i,
                "position": round((i + 0.5) / segments * 100),
                "score": max(0, min(100, int(seg.get("score", 50)))),
                "section": seg.get("section", ""),
                "note": seg.get("note", ""),
            }
        )

    return sorted(out, key=lambda s: s["index"])


STOP_WORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "was",
    "were", "for", "on", "at", "it", "this", "that", "what", "how", "did",
    "does", "do", "with", "about", "their", "they", "we", "you", "any",
    "there", "have", "has", "had", "been", "be", "from", "by", "as", "can",
    "could", "would", "should", "will", "me", "my", "please", "tell",
}

# Question words that hint at a topic the transcript words for differently.
# "guidance" rarely appears near "outlook", but they are the same question.
SYNONYMS = {
    "guidance": ["outlook", "expect", "forecast", "guide", "anticipate"],
    "outlook": ["guidance", "expect", "forecast"],
    "risk": ["headwind", "challenge", "pressure", "uncertainty", "concern"],
    "risks": ["headwind", "challenge", "pressure", "uncertainty", "concern"],
    "margin": ["margins", "gross", "profitability"],
    "margins": ["margin", "gross", "profitability"],
    "revenue": ["sales", "top line", "billion", "million"],
    "growth": ["grew", "increase", "up", "yoy"],
    "demand": ["orders", "backlog", "customers"],
    "previous": ["last", "prior", "sequential", "quarter"],
    "compare": ["versus", "sequential", "prior", "last"],
    "drivers": ["driven", "led", "because", "growth"],
    "capex": ["capital", "spending", "investment"],
    "cost": ["costs", "expenses", "opex"],
}


def terms_for(question: str) -> list[str]:
    """Meaningful words from a question, plus the words a transcript would use.

    Singular and plural are folded together, because "margins" in the question
    should still match "margin" in the call.
    """
    words = [w for w in re.findall(r"[a-z0-9']+", question.lower()) if w not in STOP_WORDS]

    terms = set()
    for word in words:
        terms.add(word)

        if len(word) > 3 and word.endswith("s"):
            terms.add(word[:-1])

        terms.update(SYNONYMS.get(word, []))

    return sorted(terms)


def score_passage(passage: str, question: str) -> int:
    """Cheap keyword overlap so retrieval costs nothing and needs no embeddings.

    Exact question words count double; synonyms and stems count once. That
    keeps a passage that genuinely uses the asked-about word ahead of one that
    merely brushes the topic.
    """
    asked = {
        w for w in re.findall(r"[a-z0-9']+", question.lower()) if w not in STOP_WORDS
    }
    terms = terms_for(question)

    if not terms:
        return 0

    body = passage.lower()
    return sum(body.count(term) * (2 if term in asked else 1) for term in terms)


def call_summary(analysis: dict | None) -> str:
    """The structured analysis, rendered as context for a question.

    Questions like "compare guidance to the previous quarter" often match no
    keyword in the raw transcript, because management says "we now expect"
    rather than "guidance". Handing the model what was already extracted from
    this call means those questions get a real answer instead of a shrug — and
    it is still material from this call, not outside knowledge.
    """
    if not analysis:
        return "No structured summary is available for this call."

    guidance = analysis.get("guidance") or {}
    sentiment = analysis.get("sentiment") or {}
    risks = analysis.get("risk_flags") or []

    lines = [
        f"Company: {analysis.get('company', 'unknown')} "
        f"({analysis.get('ticker') or 'no ticker'})",
        f"Quarter: {analysis.get('quarter') or 'not stated'}",
        f"Date: {analysis.get('date') or 'not stated'}",
        f"Guidance direction: {guidance.get('direction', 'Not Given')}",
    ]

    if guidance.get("summary"):
        lines.append(f"Guidance detail: {guidance['summary']}")

    if analysis.get("revenue_outlook"):
        lines.append(f"Forward revenue guided to: {analysis['revenue_outlook']}")

    if sentiment.get("score") is not None:
        lines.append(
            f"Management tone: {sentiment.get('score')}/100 "
            f"({sentiment.get('label', 'unknown')})"
        )

    if risks:
        lines.append("Risks flagged on this call: " + "; ".join(risks))

    for side in ("bullish_points", "bearish_points"):
        points = analysis.get(side) or []
        if points:
            label = "Positives" if side.startswith("bull") else "Negatives"
            lines.append(
                f"{label}: " + " | ".join(p.get("text", "") for p in points)
            )

    return "\n".join(lines)


def answer_question(
    question: str, chunks: list[str], analysis: dict | None = None, top_k: int = 6
) -> dict:
    scores = [score_passage(c, question) for c in chunks]
    ranked = sorted(range(len(chunks)), key=lambda i: scores[i], reverse=True)
    picked = [i for i in ranked[:top_k] if scores[i] > 0]

    # Nothing matched on keywords. Send the opening and the closing of the call
    # rather than nothing: the opening carries the headline numbers and the end
    # carries the closing Q&A, which is where most unmatched questions land.
    if not picked:
        edges = list(range(min(3, len(chunks))))
        edges += list(range(max(0, len(chunks) - 3), len(chunks)))
        picked = sorted(set(edges))

    # Read in transcript order, which is easier for the model to follow than
    # relevance order.
    picked = sorted(picked)

    passages = "\n\n".join(f"[{i}] {chunks[i]}" for i in picked)

    result = _generate(
        ANSWER_PROMPT.format(
            question=question,
            passages=passages,
            summary=call_summary(analysis),
        ),
        ANSWER_SCHEMA,
    )

    result["citations"] = [
        {"index": i, "excerpt": chunks[i][:400]}
        for i in result.get("used_passages", [])
        if 0 <= i < len(chunks)
    ]

    return result
