"""Audio and video transcription via Gemini.

Gemini accepts audio and video natively, so an MP3 or MP4 can be turned into a
speaker-labelled transcript without a separate speech-to-text service. That
transcript then feeds the exact same analysis pipeline as an uploaded TXT, so
the analysis problem is only solved once.

Files above ~18MB go through the Files API rather than inline bytes, because
inline request bodies are capped around 20MB.
"""

import os
import shutil
import subprocess
import tempfile
import time

MIME = {
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}

VIDEO = {".mp4", ".mov", ".webm"}

INLINE_LIMIT = 18 * 1024 * 1024

# Video is expensive to send: the model samples roughly a frame a second, and
# each frame costs far more than a second of audio. An hour of video overruns
# the context window on its own, while an hour of audio fits comfortably. Since
# an earnings call carries no information in the picture, we strip the audio
# track out of any video before sending it.
FFMPEG_TIMEOUT = 600

TRANSCRIBE_PROMPT = """Transcribe this earnings call in full.

Format it as a readable transcript:

- Label each speaker on their own line as "NAME (ROLE):" when you can identify
  them from the audio, for example "COLETTE KRESS (CFO):". Use "SPEAKER 1:" and
  so on only when a name is genuinely not determinable.
- Mark the section transitions with a line reading "PREPARED REMARKS" and
  "QUESTION AND ANSWER SESSION" where they occur.
- Transcribe what is actually said. Do not summarise, do not paraphrase, and do
  not add commentary of your own.
- Include the numbers and figures exactly as spoken.
"""


def is_media(filename: str) -> bool:
    return _ext(filename) in MIME


def _ext(filename: str) -> str:
    return "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def ffmpeg_path() -> str | None:
    """Where ffmpeg lives, if anywhere.

    A system install is preferred, but Homebrew is a big ask for someone just
    running the project, so imageio-ffmpeg is a fallback: it is a normal pip
    dependency that ships a static ffmpeg binary. Either one works identically
    from here.
    """
    system = shutil.which("ffmpeg")
    if system:
        return system

    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def has_ffmpeg() -> bool:
    return ffmpeg_path() is not None


def extract_audio(filename: str, raw: bytes) -> bytes:
    """Return just the audio track of a video, as mono 16kHz MP3.

    Mono at 16kHz is plenty for speech and shrinks an hour of call audio to a
    few megabytes, which usually keeps it under the inline limit as well.
    """
    ext = _ext(filename)

    with tempfile.TemporaryDirectory() as work:
        src = os.path.join(work, f"in{ext}")
        dst = os.path.join(work, "out.mp3")

        with open(src, "wb") as handle:
            handle.write(raw)

        binary = ffmpeg_path()

        if not binary:
            raise RuntimeError("ffmpeg is not available.")

        result = subprocess.run(
            [
                binary, "-nostdin", "-y",
                "-i", src,
                "-vn",                  # drop the video stream
                "-ac", "1",             # mono
                "-ar", "16000",         # 16kHz is ample for speech
                "-b:a", "48k",
                dst,
            ],
            capture_output=True,
            timeout=FFMPEG_TIMEOUT,
        )

        if result.returncode != 0 or not os.path.exists(dst):
            tail = result.stderr.decode("utf-8", "replace")[-300:]
            raise RuntimeError(f"Could not read the audio out of that video. {tail}")

        with open(dst, "rb") as handle:
            return handle.read()


def transcribe(filename: str, raw: bytes) -> str:
    """Return a speaker-labelled transcript for an audio or video file."""
    from analyzer import (
        MODEL_CANDIDATES,
        _client,
        _explain,
        _working_model,
        auth_schemes,
        remember_scheme,
    )
    from google.genai import types

    ext = _ext(filename)
    mime = MIME.get(ext)

    if not mime:
        raise ValueError(f"{ext} is not a supported audio or video format.")

    if ext in VIDEO:
        if has_ffmpeg():
            raw = extract_audio(filename, raw)
            mime = MIME[".mp3"]
        elif len(raw) > 40 * 1024 * 1024:
            # Without ffmpeg the frames go too, and anything of this size is a
            # long enough call to overrun the context window.
            raise RuntimeError(
                "That video is too long to send whole, and ffmpeg is not "
                "installed to pull the audio out of it. Run "
                "'pip install -r requirements.txt' in the backend folder, or "
                "upload the audio track on its own as an MP3 or M4A."
            )

    order = [m for m in ([_working_model] if _working_model else []) + MODEL_CANDIDATES if m]
    problems = []
    auth_error = None

    # Google accepts old keys as an api-key header and new ones as a bearer
    # token. Same dance as analyzer._generate — kept in step through
    # auth_schemes() so whichever one works is only discovered once.
    for bearer in auth_schemes():
        client = _client(bearer=bearer)
        uploaded = None

        try:
            if len(raw) <= INLINE_LIMIT:
                part = types.Part.from_bytes(data=raw, mime_type=mime)
                contents = [part, TRANSCRIBE_PROMPT]
            else:
                uploaded = _upload(client, filename, raw, mime)
                contents = [uploaded, TRANSCRIBE_PROMPT]

            for name in order:
                try:
                    response = client.models.generate_content(
                        model=name,
                        contents=contents,
                        config=types.GenerateContentConfig(temperature=0.1),
                    )
                    text = (response.text or "").strip()

                    if len(text.split()) < 50:
                        raise RuntimeError("the model returned almost no text")

                    remember_scheme(bearer)
                    return text
                except Exception as exc:
                    detail = str(exc)

                    if "401" in detail or "UNAUTHENTICATED" in detail:
                        auth_error = exc
                        break

                    problems.append(f"{name}: {detail[:80]}")

                    if not any(
                        code in detail
                        for code in ("404", "429", "NOT_FOUND", "RESOURCE_EXHAUSTED")
                    ):
                        raise
        except Exception as exc:
            # An upload can fail on auth too, before any model is reached.
            if "401" in str(exc) or "UNAUTHENTICATED" in str(exc):
                auth_error = exc
            else:
                raise
        finally:
            # Uploaded media counts against storage, so clean it up either way.
            if uploaded is not None:
                try:
                    client.files.delete(name=uploaded.name)
                except Exception:
                    pass

    if auth_error is not None:
        raise _explain(auth_error) from auth_error

    raise RuntimeError("Could not transcribe that file. Tried — " + " | ".join(problems))


def _upload(client, filename, raw, mime, timeout=180):
    """Push a large file through the Files API and wait for it to be ready."""
    import io

    handle = client.files.upload(
        file=io.BytesIO(raw),
        config={"mime_type": mime, "display_name": os.path.basename(filename)},
    )

    waited = 0
    while getattr(handle.state, "name", handle.state) == "PROCESSING":
        if waited > timeout:
            raise TimeoutError("The file took too long to process.")
        time.sleep(3)
        waited += 3
        handle = client.files.get(name=handle.name)

    if getattr(handle.state, "name", handle.state) == "FAILED":
        raise RuntimeError("The provider could not process that media file.")

    return handle
