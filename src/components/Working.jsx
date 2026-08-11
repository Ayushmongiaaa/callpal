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
  // Bar width and gap are derived from `size` rather than fixed.
  //
  // They used to be hardcoded at 3px and 2.5px, which meant the component had
  // an intrinsic width of 25px no matter what it was told. Rendered at 9px
  // inside a small bullet it spilled straight out of its container as
  // overlapping blobs. Five bars plus four gaps now always come to 0.89 × size,
  // so it fits whatever box it is given.
  const bar = size / 9;
  const gap = size / 12;

  return (
    <span
      className="working"
      style={{ width: size, height: size, gap: `${gap}px` }}
      role="status"
      aria-label="Working"
    >
      {BARS.map((b, i) => (
        <i
          key={i}
          style={{
            width: `${bar}px`,
            borderRadius: `${Math.max(1, bar / 2)}px`,
            animationDelay: b.delay,
            animationDuration: b.duration,
            "--peak": b.scale,
          }}
        />
      ))}
    </span>
  );
}
