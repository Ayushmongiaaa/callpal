"""Turn whatever a transcript calls a date into an ISO one.

The model is told to copy the date from the transcript, and transcripts write
dates however they please: "April 23rd, 2024", "23 April 2024", "4/23/24",
"Q1 FY2026". The frontend needs YYYY-MM-DD to sort and group, and anything else
renders as "Invalid Date".

Normalising here rather than in the browser means the stored value is already
clean, so the calendar, the timeline sort and any future export all agree.
"""

import re
from datetime import date

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

# "23rd", "1st", "2nd" -> "23", "1", "2"
ORDINAL = re.compile(r"(\d{1,2})(st|nd|rd|th)\b", re.I)


def normalise(value: str) -> str:
    """Return YYYY-MM-DD, or "" when the text holds no usable date.

    Returning "" rather than guessing is deliberate: a wrong date on a chart is
    worse than a missing one, and the UI already handles "date not stated".
    """
    if not value or not isinstance(value, str):
        return ""

    text = ORDINAL.sub(r"\1", value.strip())

    # Already ISO.
    match = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", text)
    if match:
        return _build(*match.groups())

    # "April 23, 2024" / "Apr 23 2024"
    match = re.search(r"\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b", text)
    if match:
        month = MONTHS.get(match.group(1)[:3].lower())
        if month:
            return _build(match.group(3), month, match.group(2))

    # "23 April 2024"
    match = re.search(r"\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b", text)
    if match:
        month = MONTHS.get(match.group(2)[:3].lower())
        if month:
            return _build(match.group(3), month, match.group(1))

    # "4/23/2024" or "4/23/24" — US order, which is what these transcripts use.
    match = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{2,4})\b", text)
    if match:
        year = match.group(3)
        if len(year) == 2:
            year = f"20{year}"
        return _build(year, match.group(1), match.group(2))

    return ""


def _build(year, month, day) -> str:
    try:
        return date(int(year), int(month), int(day)).isoformat()
    except (ValueError, TypeError):
        # A real date that does not exist — February 30th and friends.
        return ""
