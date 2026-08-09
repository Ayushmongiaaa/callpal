"""Turn an uploaded file into plain transcript text.

TXT is supported first, then PDF and DOCX. Audio and video deliberately come
later: once they are transcribed they feed this same text pipeline, so the
analysis problem only has to be solved once.
"""

import io

SUPPORTED_TEXT = {".txt", ".md"}
SUPPORTED_DOC = {".pdf", ".docx"}
# Audio and video never reach this module — main.py routes them to media.py
# for transcription first. Kept here only so an unroutable case gives a useful
# message instead of a generic one.
SUPPORTED_MEDIA = {
    ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac", ".mp4", ".mov", ".webm",
}


class UnsupportedFile(Exception):
    pass


def _extension(filename: str) -> str:
    return "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def extract_text(filename: str, raw: bytes) -> str:
    """Return the transcript text contained in an uploaded file."""
    ext = _extension(filename)

    if ext in SUPPORTED_TEXT:
        return _decode(raw)

    if ext == ".pdf":
        return _from_pdf(raw)

    if ext == ".docx":
        return _from_docx(raw)

    if ext in SUPPORTED_MEDIA:
        raise UnsupportedFile(
            "That recording could not be routed for transcription. "
            "Try re-uploading it, or upload a text transcript instead."
        )

    raise UnsupportedFile(
        f"{ext or 'That file type'} is not supported. Upload a transcript "
        "(TXT, MD, PDF, DOCX) or a recording (MP3, WAV, M4A, MP4, MOV, WEBM)."
    )


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def _from_pdf(raw: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(pages)


def _from_docx(raw: bytes) -> str:
    import docx

    document = docx.Document(io.BytesIO(raw))
    return "\n".join(p.text for p in document.paragraphs)


def clean(text: str) -> str:
    """Collapse the ragged whitespace typical of scraped transcripts."""
    lines = [line.strip() for line in text.splitlines()]
    kept = [line for line in lines if line]
    return "\n".join(kept)


def chunk(text: str, size: int = 1200, overlap: int = 200) -> list[str]:
    """Split a transcript into overlapping windows for retrieval.

    The overlap keeps a sentence that straddles a boundary from being lost to
    both chunks.
    """
    if size <= overlap:
        raise ValueError("size must be larger than overlap")

    words = text.split()
    chunks: list[str] = []
    start = 0

    while start < len(words):
        window = words[start : start + size]
        chunks.append(" ".join(window))
        if start + size >= len(words):
            break
        start += size - overlap

    return chunks
