import React, { useRef, useState } from "react";
import {
  CheckCircle,
  SpinnerGap,
  UploadSimple,
  Warning,
} from "@phosphor-icons/react";

const formats = ["PDF", "DOCX", "TXT", "MP3", "WAV", "M4A", "MP4", "MOV"];

/**
 * The drop target.
 *
 * Handles three sources: a click-to-browse file picker, a dragged OS file, and
 * a link dragged from the in-app sample card (which arrives as a URL rather
 * than a File, so it has to be fetched and turned into one).
 */
export default function UploadCard({ onFile, status, error }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);

  const busy =
    status === "reading" ||
    status === "analyzing" ||
    status === "transcribing" ||
    status === "fetching";

  async function handleDrop(event) {
    event.preventDefault();
    setOver(false);
    if (busy) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFile(file);
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
        onFile(new File([blob], name, { type: "text/plain" }));
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
          if (file) onFile(file);
          e.target.value = "";
        }}
      />

      <div className={`upload-icon ${busy ? "spin" : ""}`}>
        {busy ? (
          <SpinnerGap size={26} weight="bold" />
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
