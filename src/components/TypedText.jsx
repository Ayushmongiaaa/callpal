import React, { useEffect, useRef, useState } from "react";

/**
 * Reveals text a few characters at a time, the way a chat interface does.
 *
 * This is presentation only — the full answer has already arrived from the API
 * before a single character is shown. It is not faked thinking time: the dots
 * cover the real wait, and this covers the delivery, which is what makes a long
 * answer readable instead of a wall that appears in one frame.
 *
 * Reveal is driven by requestAnimationFrame rather than an interval per
 * character, so a 900-character answer costs about 50 frames rather than 900
 * timers.
 */

const CHARS_PER_FRAME = 2.4;

export default function TypedText({ text = "", enabled = true, onTick }) {
  const [shown, setShown] = useState(enabled ? 0 : text.length);
  const frame = useRef(null);
  const tick = useRef(onTick);

  tick.current = onTick;

  useEffect(() => {
    if (!enabled) {
      setShown(text.length);
      return undefined;
    }

    // Respect people who have asked the system for less motion.
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (still) {
      setShown(text.length);
      return undefined;
    }

    setShown(0);
    let count = 0;
    let last = 0;

    function step(now) {
      if (!last) last = now;

      // Scale by elapsed time so the speed is the same on a 120Hz display.
      const elapsed = Math.min(now - last, 64);
      last = now;

      count += (elapsed / 16.7) * CHARS_PER_FRAME;
      const next = Math.min(Math.floor(count), text.length);

      setShown(next);
      tick.current?.();

      if (next < text.length) {
        frame.current = requestAnimationFrame(step);
      }
    }

    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [text, enabled]);

  const done = shown >= text.length;

  return (
    <>
      {text.slice(0, shown)}
      {!done && <span className="caret" aria-hidden="true" />}
    </>
  );
}
