import React, { useEffect, useRef, useState } from "react";
import { Check, CheckCircle, UploadSimple, Warning } from "@phosphor-icons/react";
import Working from "./Working";

const formats = ["PDF", "DOCX", "TXT", "MP3", "WAV", "M4A", "MP4", "MOV"];

const MEDIA = /\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|webm)$/i;

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The stages of the pipeline, as they actually are.
 *
 * These map one-to-one onto real backend states — nothing invented to pad the
 * list out. A recording gains a transcription stage because it genuinely has
 * one; a PDF does not, and pretending otherwise would be a fake progress bar.
 */
function stageList(media) {
  return [
    { key: "received", label: "File received" },
    media
      ? { key: "transcribing", label: "Transcribing the audio" }
      : { key: "reading", label: "Extracting the text" },
    { key: "analyzing", label: "Reading the call" },
  ];
}

/** How far the pipeline has genuinely got. */
function realIndex({ media, status }) {
  if (status === "done") return 3;
  const order = ["received", media ? "transcribing" : "reading", "analyzing"];
  const i = order.indexOf(status);
  return i === -1 ? 0 : i;
}

function stagesFor({ media, at }) {
  return stageList(media).map((s, i) => ({
    ...s,
    state: i < at ? "done" : i === at ? "active" : "waiting",
  }));
}

/**
 * The drop target.
 *
 * Handles three sources: a click-to-browse file picker, a dragged OS file, and
 * a link dragged from the in-app sample card (which arrives as a URL rather
 * than a File, so it has to be fetched and turned into one).
 */
export default function UploadCard({ onFile, status, error }) {
  const [over, setOver] = useState(false);
  const [picked, setPicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const input = useRef(null);

  const busy =
    status === "reading" ||
    status === "analyzing" ||
    status === "transcribing" ||
    status === "fetching";

  // Remembering the file is the whole point: seeing your own filename come back
  // is what proves the click registered. Without it the card looked identical
  // busy or idle, so an upload felt like nothing had happened.
  function send(file) {
    setPicked({ name: file.name, size: file.size });
    setElapsed(0);
    setAt(0);
    onFile(file);
  }

  // An honest elapsed counter, not a fake progress bar. We cannot know how long
  // the model will take, so claiming a percentage would be a lie — but showing
  // that time is passing is true and answers "is this still going?".
  useEffect(() => {
    if (!busy) return undefined;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const media = picked ? MEDIA.test(picked.name) : false;
  const real = realIndex({ media, status });

  // How far the *display* has got, which trails the pipeline rather than
  // leading it.
  //
  // Pulling the text out of a 4KB transcript genuinely takes a few
  // milliseconds, so every tick was already green on the first frame and there
  // was no sequence to watch. Holding each stage for a moment makes the order
  // legible. The direction matters: the display never claims a stage is done
  // before it is — it only ever lags, so it under-claims rather than
  // inventing progress that has not happened.
  const [at, setAt] = useState(0);

  useEffect(() => {
    if (at >= real) return undefined;
    const id = setTimeout(() => setAt((i) => Math.min(i + 1, real)), 560);
    return () => clearTimeout(id);
  }, [at, real]);

  const stages = stagesFor({ media, at });

  async function handleDrop(event) {
    event.preventDefault();
    setOver(false);
    if (busy) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      send(file);
      return;
    }

    // The sample card drags a URL, not a File. Fetch it and rebuild a File so
    // the rest of the pipeline sees exactly what a real upload looks like.
    const url =
      event.dataTransfer.getData("text/uri-list") ||
      event.dataTransfer.getData("text/plain");

    if (url) {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const name = url.split("/").pop() || "transcript.txt";
        send(new File([blob], name, { type: "text/plain" }));
      } catch {
        /* ignore — a bad drag should not break the page */
      }
    }
  }

  return (
    <section
      className={`upload-card glass ${over ? "over" : ""} ${busy ? "busy" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      onClick={() => !busy && input.current?.click()}
    >
      <input
        ref={input}
        type="file"
        accept=".txt,.md,.pdf,.docx,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.mov,.webm"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) send(file);
          e.target.value = "";
        }}
      />

      <div
        className={`upload-icon ${busy ? "busy" : ""} ${
          status === "done" ? "done" : ""
        }`}
      >
        {busy ? (
          <Working size={26} />
        ) : status === "done" ? (
          <CheckCircle size={26} weight="fill" />
        ) : (
          <UploadSimple size={26} weight="bold" />
        )}
      </div>

      <div>
        <h3>
          {status === "fetching"
            ? "Fetching the transcript…"
            : status === "transcribing"
              ? "Transcribing the recording…"
              : status === "analyzing"
                ? "Reading the call…"
                : status === "reading"
                  ? "Opening file…"
                  : status === "done"
                    ? "Analysis complete"
                    : "Upload a transcript or recording"}
        </h3>
        <p>
          {status === "fetching"
            ? "Pulling the published transcript for that company."
            : status === "transcribing"
              ? "Audio and video are transcribed first. A full call can take a few minutes."
              : busy
                ? "Extracting the text and analyzing it. This takes a few seconds."
                : over
                  ? "Drop it to analyze"
                  : "Drag and drop here or click to browse"}
        </p>
      </div>

      {error ? (
        <div className="upload-error">
          <Warning size={13} weight="fill" />
          <span>{error}</span>
        </div>
      ) : picked && (busy || at < stages.length) ? (
        // The format chips are guidance for choosing a file. Once one is
        // chosen they are noise, and leaving them up is why a running upload
        // looked identical to an idle card.
        <div className="upload-progress">
          <div className="up-file">
            <span className="up-name" title={picked.name}>
              {picked.name}
            </span>
            <span className="up-size">{humanSize(picked.size)}</span>
          </div>

          <ul className="up-stages">
            {stages.map((s) => (
              <li className={s.state} key={s.key}>
                {/* A pulsing dot, not the waveform. The waveform is five bars
                    plus gaps — about 25px wide — and forcing it into a 15px
                    bullet made it spill out as overlapping blobs. */}
                <i>
                  {s.state === "done" ? <Check size={9} weight="bold" /> : null}
                  {s.state === "active" ? <b /> : null}
                </i>
                {s.label}
              </li>
            ))}
          </ul>

          <span className="up-elapsed">
            {status === "done" && at >= stages.length
              ? `Done in ${elapsed}s`
              : elapsed < 60
                ? `${elapsed}s elapsed`
                : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s elapsed`}
          </span>
        </div>
      ) : (
        <>
          <div className="chips">
            {formats.map((f) => (
              <span className="chip" key={f}>
                {f}
              </span>
            ))}
          </div>
          <span className="upload-limit">Max 500MB</span>
        </>
      )}
    </section>
  );
}
