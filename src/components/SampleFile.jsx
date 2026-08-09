import React, { useState } from "react";
import { DownloadSimple, FileText, HandGrabbing } from "@phosphor-icons/react";

/**
 * A ready-made transcript sitting in the corner of the dashboard.
 *
 * A recruiter evaluating this project will not go hunting for an earnings call
 * transcript to test it with. This gives them one they can drag straight into
 * the upload card — or download if they want to inspect it first.
 *
 * Dragging sets both `DownloadURL` (so a real File lands on the drop target)
 * and a plain-text fallback.
 */
export default function SampleFile() {
  const [dragging, setDragging] = useState(false);

  const FILE = "/sample-tsla-q1-2024.txt";
  const NAME = "sample-tsla-q1-2024.txt";

  function onDragStart(event) {
    setDragging(true);

    const url = `${window.location.origin}${FILE}`;
    // Chrome and Edge understand this triple; it makes the drag carry an actual
    // downloadable file rather than a bare link.
    event.dataTransfer.setData("DownloadURL", `text/plain:${NAME}:${url}`);
    event.dataTransfer.setData("text/uri-list", url);
    event.dataTransfer.setData("text/plain", url);
    event.dataTransfer.effectAllowed = "copy";
  }

  return (
    <aside
      className={`sample-card ${dragging ? "dragging" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
      title="Drag me into the upload area"
    >
      <div className="sample-icon">
        <FileText size={20} weight="duotone" />
      </div>

      <div className="sample-body">
        <strong>Try it with a sample</strong>
        <span>Tesla Q1 2024 update call · TXT</span>
      </div>

      <div className="sample-actions">
        <span className="sample-hint">
          <HandGrabbing size={12} weight="fill" />
          Drag to upload
        </span>
        <a
          className="sample-dl"
          href={FILE}
          download={NAME}
          onClick={(event) => event.stopPropagation()}
          title="Download the sample"
        >
          <DownloadSimple size={13} weight="bold" />
        </a>
      </div>
    </aside>
  );
}
