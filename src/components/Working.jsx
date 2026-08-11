import React from "react";

/**
 * The "something is happening" indicator.
 *
 * This was a rotating spinner gap — the most generic loading element there is,
 * and it looked it: a constant-speed rotation carries no information and reads
 * as filler.
 *
 * A waveform is both more alive and actually about this product: CallPal is
 * reading a call. The bars run on staggered, differently-timed loops so the
 * pattern never visibly repeats, which is what keeps it from feeling like a
 * looping GIF. Pure CSS — no canvas, no library, nothing to load.
 */

// Deliberately non-multiples of each other. Equal durations would resynchronise
// every cycle and the whole thing would pulse in unison.
const BARS = [
  { delay: "0s", duration: "0.92s", scale: 0.42 },
  { delay: "0.13s", duration: "1.18s", scale: 0.78 },
  { delay: "0.06s", duration: "0.84s", scale: 1 },
  { delay: "0.21s", duration: "1.06s", scale: 0.66 },
  { delay: "0.09s", duration: "1.3s", scale: 0.5 },
];

export default function Working({ size = 26 }) {
  return (
    <span
      className="working"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Working"
    >
      {BARS.map((bar, i) => (
        <i
          key={i}
          style={{
            animationDelay: bar.delay,
            animationDuration: bar.duration,
            "--peak": bar.scale,
          }}
        />
      ))}
    </span>
  );
}
