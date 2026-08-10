import React from "react";

/**
 * The label on a vertical reference line — "Call", "Q&A", and anything added
 * later.
 *
 * Recharts' built-in `position: "top"` label draws the text *above* the plot
 * area, into whatever top margin the chart happens to reserve. Both charts here
 * reserved about 8px, so the text was sliced in half and landed on the top
 * gridline. It looked like a rendering fault and it was unreadable.
 *
 * This draws a filled pill instead, which cannot be confused with the grid, and
 * clamps itself so a line near either edge does not push the label off the
 * chart. Charts using it must reserve room: `margin={{ top: 26, ... }}`.
 *
 * It lives in its own file because the bug existed identically in two charts
 * and was fixed in only one of them — one implementation is the fix.
 */

const H = 16;
const PAD = 9;
const CHAR = 5.6;

export default function ChartMarker({ text = "", viewBox }) {
  if (!viewBox) return null;

  const w = Math.max(28, Math.round(text.length * CHAR + PAD * 2));

  const plotLeft = viewBox.x - (viewBox.width ?? 0);
  const min = Number.isFinite(plotLeft) ? Math.max(0, plotLeft) : 0;

  // Centre on the line, then keep the whole pill inside the plot.
  let left = viewBox.x - w / 2;
  if (viewBox.width) {
    left = Math.min(Math.max(left, min), viewBox.x + viewBox.width - w);
  }

  return (
    <g transform={`translate(${Math.max(0, left)}, ${Math.max(1, viewBox.y - H - 5)})`}>
      <rect width={w} height={H} rx={5} fill="#a78bfa" />
      <text
        x={w / 2}
        y={H / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9.5"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#17131f"
      >
        {text}
      </text>
    </g>
  );
}
