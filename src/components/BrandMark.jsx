import React, { useState } from "react";
import { CallPalMark } from "./Logos";

/**
 * The CallPal mark.
 *
 * Drop a file at `public/logo.png` (or `.svg`, or `.webp`) and it is used.
 * Nothing else needs changing. If no file is there, the inline mark from
 * Logos.jsx is drawn instead, so a missing logo never shows as a broken image.
 *
 * See README for the file specification.
 */

// Order matters. A file dropped in by hand must win over anything already
// committed here, so the formats a person is most likely to export are checked
// first. If none of these exist the inline mark in Logos.jsx is drawn.
const CANDIDATES = ["/logo.png", "/logo.svg", "/logo.webp"];

export default function BrandMark({ size = 19 }) {
  const [attempt, setAttempt] = useState(0);

  if (attempt < CANDIDATES.length) {
    return (
      <img
        className="brand-img"
        src={CANDIDATES[attempt]}
        alt="CallPal"
        width={size}
        height={size}
        onError={() => setAttempt((a) => a + 1)}
      />
    );
  }

  return <CallPalMark size={size} />;
}
