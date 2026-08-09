import React, { useEffect, useState } from "react";
import { NvidiaMark, MicrosoftMark, AppleMark } from "./Logos";

/**
 * A logo for whatever company the uploaded transcript turned out to be.
 *
 * Resolution order:
 *   1. a hand-drawn SVG mark for companies we bundle
 *   2. a remote favicon service, using the domain Gemini extracted
 *   3. a violet monogram from the ticker
 *
 * Two remote sources are tried in turn because these services come and go —
 * Clearbit's free logo API was the obvious choice until it was shut down. If
 * every source fails the monogram renders, so a broken-image icon never
 * appears in front of a recruiter.
 */

const BUILT_IN = {
  NVDA: NvidiaMark,
  MSFT: MicrosoftMark,
  AAPL: AppleMark,
};

const SOURCES = [
  (d) => `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
  (d) => `https://icons.duckduckgo.com/ip3/${d}.ico`,
];

export default function CompanyLogo({ ticker, website, size = 20 }) {
  const [attempt, setAttempt] = useState(0);

  // A new company gets a fresh run through the sources.
  useEffect(() => {
    setAttempt(0);
  }, [website, ticker]);

  const Built = BUILT_IN[ticker];
  if (Built) return <Built size={size} />;

  const domain = (website || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

  if (domain && attempt < SOURCES.length) {
    return (
      <img
        className="company-logo-img"
        src={SOURCES[attempt](domain)}
        alt={ticker || domain}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setAttempt((a) => a + 1)}
      />
    );
  }

  return (
    <span
      className="company-logo-mono"
      style={{ fontSize: Math.max(9, size * 0.42) }}
    >
      {(ticker || "?").slice(0, 2).toUpperCase()}
    </span>
  );
}
