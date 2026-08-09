import React from "react";

/**
 * Inline SVG marks. Kept as components rather than image files so they inherit
 * colour, stay crisp at any size, and cost no extra network requests.
 */

export function CallPalMark({ size = 22 }) {
  // The same mark as public/logo.svg, drawn inline so it inherits colour from
  // the page. Used when no logo file is present.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="29" strokeWidth="2.2" />
      <circle cx="32" cy="32" r="24" strokeWidth="1.4" opacity="0.85" />

      <g strokeWidth="3.2">
        <path d="M23 26v12" />
        <path d="M27.5 22v20" />
        <path d="M32 18v28" />
        <path d="M36.5 22v20" />
        <path d="M41 26v12" />
      </g>

      <g strokeWidth="3.6">
        <path d="M16.5 32h0.01" />
        <path d="M47.5 32h0.01" />
      </g>
    </svg>
  );
}


export function NvidiaMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.6 9.3v-1.5c.15-.01.3-.02.45-.02 4.13-.13 6.84 3.55 6.84 3.55s-2.93 4.07-6.07 4.07c-.42 0-.83-.07-1.22-.2v-4.55c1.6.2 1.93.9 2.9 2.5l2.15-1.8s-1.57-2.06-4.22-2.06c-.28 0-.55.01-.83.01Zm0-4.9v2.24l.45-.03c5.74-.2 9.48 4.7 9.48 4.7s-4.3 5.23-8.77 5.23c-.4 0-.78-.04-1.16-.1v1.38c.31.04.63.06.96.06 4.16 0 7.17-2.13 10.08-4.64.48.39 2.46 1.33 2.87 1.74-2.77 2.32-9.22 4.19-12.88 4.19-.35 0-.69-.02-1.03-.06v1.95H23V4.4H8.6Zm0 10.68v1.18c-3.85-.69-4.92-4.69-4.92-4.69s1.85-2.05 4.92-2.38v1.29h-.01c-1.61-.19-2.87 1.31-2.87 1.31s.71 2.53 2.88 3.29ZM1.79 11.4s2.28-3.37 6.82-3.72V6.46C3.58 6.86 0 11.11 0 11.11s2.03 5.86 8.6 6.48v-1.29c-4.82-.6-6.81-4.9-6.81-4.9Z"
        fill="#76B900"
      />
    </svg>
  );
}

export function MicrosoftMark({ size = 20 }) {
  const s = size / 2 - 1;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect x="0" y="0" width={s} height={s} fill="#F25022" />
      <rect x={s + 2} y="0" width={s} height={s} fill="#7FBA00" />
      <rect x="0" y={s + 2} width={s} height={s} fill="#00A4EF" />
      <rect x={s + 2} y={s + 2} width={s} height={s} fill="#FFB900" />
    </svg>
  );
}

export function AppleMark({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17.05 12.54c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.9-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.86 1.42-2.93-.03-.01-2.72-1.04-2.74-4.11ZM14.5 4.9c.71-.87 1.19-2.07 1.06-3.27-1.02.04-2.26.68-3 1.54-.66.77-1.24 2-1.08 3.17 1.14.09 2.31-.58 3.02-1.44Z"
        fill="#E8E6F0"
      />
    </svg>
  );
}

const MARKS = {
  NVDA: NvidiaMark,
  MSFT: MicrosoftMark,
  AAPL: AppleMark,
};

export function CompanyMark({ ticker, size = 20 }) {
  const Mark = MARKS[ticker];

  if (Mark) return <Mark size={size} />;

  // Unknown company: fall back to the ticker initials.
  return (
    <span style={{ fontSize: size * 0.45, fontWeight: 800 }}>
      {(ticker || "??").slice(0, 2)}
    </span>
  );
}

export default CompanyMark;
