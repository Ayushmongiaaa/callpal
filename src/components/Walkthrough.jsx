import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ChartLineUp,
  ChatCircleDots,
  FileArrowUp,
  MagnifyingGlass,
  Notebook,
  HandGrabbing,
  X,
} from "@phosphor-icons/react";

/**
 * Spotlight product tour.
 *
 * Rather than a modal in the middle of the screen, each step dims the page,
 * cuts a hole around a real element, and puts an explanation card beside it —
 * so a recruiter sees what each part of the dashboard actually is.
 *
 * The dimming is done with a huge `box-shadow` spread on a box positioned over
 * the target. That gives a crisp hole with no SVG masks and no layout cost.
 */

const STEPS = [
  {
    target: ".search-wrap",
    icon: MagnifyingGlass,
    tag: "Step 1",
    title: "Search a company by name",
    body: "Type a company or ticker and CallPal pulls its most recent published earnings call for you — no file to find.",
    place: "bottom",
  },
  {
    target: ".upload-card",
    icon: FileArrowUp,
    tag: "Step 2",
    title: "Or drop your own call in here",
    body: "A transcript as PDF, DOCX or TXT — or the raw recording as MP3, WAV, M4A, MP4 or MOV. Recordings are transcribed first, then analyzed the same way.",
    place: "right",
  },
  {
    target: ".featured",
    icon: Notebook,
    tag: "Step 3",
    title: "It works out what happened",
    body: "Company, quarter, whether guidance was raised or cut, and the revenue outlook — all read from the transcript, never assumed.",
    place: "bottom",
  },
  {
    target: ".metrics",
    icon: ChartLineUp,
    tag: "Step 4",
    title: "The numbers that matter",
    body: "Management's tone scored out of 100, the guidance direction, the forward revenue figure and any risks flagged on the call.",
    place: "bottom",
  },
  {
    target: ".bottom-grid > section:first-child",
    icon: ChartLineUp,
    tag: "Step 5",
    title: "See how the market reacted",
    body: "Real daily candles from Yahoo Finance around the call date. Switch to Sentiment Over Time to see management's tone scored section by section — it usually dips once the analysts start asking.",
    place: "right",
  },
  {
    target: ".assistant",
    icon: ChatCircleDots,
    tag: "Step 6",
    title: "Ask it anything",
    body: "Questions in plain English, answered with quotes lifted straight from the transcript and the speaker named.",
    place: "left",
  },
  {
    target: ".nav",
    icon: Archive,
    tag: "Step 7",
    title: "Everything you analyze is kept",
    body: "Calls are stored, so you can reopen one, compare two side by side, or see them all on a timeline — without uploading anything twice.",
    place: "right",
  },
  {
    target: ".sample-card",
    icon: HandGrabbing,
    tag: "Try it",
    title: "Drag this sample in",
    body: "A Tesla earnings call, ready to go — a different company to the one on screen, so you can watch the whole dashboard change. Or bring your own transcript.",
    place: "top",
  },
];

const PAD = 8;
const CARD_W = 320;

export default function Walkthrough({ delay = 4000 }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);

  // Whether the spotlight is settled at its destination and safe to show.
  // Nothing is drawn while a step change is in flight, so there is no travel.
  const [shown, setShown] = useState(false);

  // Runs on every page load rather than once per session.
  //
  // The tour exists for someone landing on this for the first time — a
  // recruiter who has thirty seconds and no idea what the product is. Gating it
  // behind sessionStorage meant it fired once and then never again, including
  // on a refresh, which made it look broken to the person building it. Closing
  // it still dismisses it for that view; a refresh brings it back.
  useEffect(() => {
    const timer = setTimeout(() => setOpen(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  /**
   * Place the spotlight on the current step's element.
   *
   * Three failure modes have been through here, so the reasoning is worth
   * keeping:
   *
   *   1. Gliding *while* the page scrolled made it chase a moving target and
   *      jitter. So scrolling and moving are now strictly sequential.
   *   2. Tracking the element every frame during the scroll made it ride along
   *      with the page and appear to wander somewhere wrong first. So it holds
   *      still on the previous element while the page scrolls.
   *   3. Unmounting it between steps made the page flash undimmed for a frame,
   *      because the dimming *is* the spotlight's shadow. So it is never
   *      unmounted — it stays put, then glides once, after the page is still.
   *
   * The result: scroll, wait for everything to settle, then one eased move.
   */
  useLayoutEffect(() => {
    if (!open) return undefined;

    const el = document.querySelector(STEPS[step].target);

    if (!el) {
      setRect(null);
      return undefined;
    }

    let cancelled = false;
    let frame = 0;

    const place = () => {
      if (cancelled) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      setShown(true);
    };

    const box = el.getBoundingClientRect();
    const needsScroll = box.top < 80 || box.bottom > window.innerHeight - 80;

    if (!needsScroll) {
      place();
      return undefined;
    }

    el.scrollIntoView({ block: "center", behavior: "smooth" });

    // Hold position while the page moves, and do not measure until it has
    // stopped. The rail and the sidebar are `position: sticky`, so they keep
    // shifting until the scroll ends — measuring early is what put the
    // spotlight somewhere it did not belong.
    const deadline = performance.now() + 1600;
    let lastTop = null;
    let stillFor = 0;

    const settled = () => {
      if (cancelled) return;

      const r = el.getBoundingClientRect();
      stillFor = lastTop !== null && Math.abs(r.top - lastTop) < 0.5 ? stillFor + 1 : 0;
      lastTop = r.top;

      if (stillFor >= 3 || performance.now() > deadline) {
        place();
        return;
      }

      frame = requestAnimationFrame(settled);
    };

    frame = requestAnimationFrame(settled);

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [open, step]);

  /**
   * Keep the hole glued to its element if the user scrolls or resizes by hand.
   *
   * This runs only once the spotlight is settled and visible, and it writes the
   * position with no transition, so it tracks exactly rather than lagging
   * behind — the user is driving, so following is correct here.
   */
  useEffect(() => {
    if (!open || !shown) return undefined;

    const el = document.querySelector(STEPS[step].target);
    if (!el) return undefined;

    const sync = () => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    window.addEventListener("scroll", sync, true);
    window.addEventListener("resize", sync);

    return () => {
      window.removeEventListener("scroll", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [open, shown, step]);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;

    function onKey(e) {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && step < STEPS.length - 1) setStep((s) => s + 1);
      if (e.key === "ArrowLeft" && step > 0) setStep((s) => s - 1);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, close]);

  if (!open) return null;

  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  // Place the card next to the hole, flipping side when it would run off-screen.
  let cardStyle = {};

  if (rect) {
    const { top, left, width, height } = rect;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let place = current.place;
    if (place === "right" && left + width + CARD_W + 40 > vw) place = "left";
    if (place === "left" && left - CARD_W - 40 < 0) place = "right";

    if (place === "right") {
      cardStyle = { top: Math.min(top, vh - 300), left: left + width + 18 };
    } else if (place === "left") {
      cardStyle = { top: Math.min(top, vh - 300), left: Math.max(16, left - CARD_W - 18) };
    } else if (place === "top") {
      cardStyle = {
        top: Math.max(16, top - 250),
        left: Math.min(Math.max(16, left + width / 2 - CARD_W / 2), vw - CARD_W - 16),
      };
    } else {
      cardStyle = {
        top: Math.min(top + height + 18, vh - 280),
        left: Math.min(Math.max(16, left + width / 2 - CARD_W / 2), vw - CARD_W - 16),
      };
    }
  }

  return (
    <div className="tour">
      {/* Never unmounted while a target exists: this element's shadow *is* the
          page dimming, so swapping it out flashes the page bright. */}
      {rect ? (
        <div
          className="tour-hole"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
          onClick={close}
        />
      ) : (
        <div className="tour-veil-plain" onClick={close} />
      )}

      <div
        className={`tour-card ${shown ? "shown" : ""}`}
        style={rect ? cardStyle : undefined}
        role="dialog"
        aria-label="CallPal walkthrough"
      >
        <button className="tour-close" onClick={close} aria-label="Close tour">
          <X size={14} weight="bold" />
        </button>

        <div className="tour-top">
          <div className="tour-icon">
            <Icon size={19} weight="duotone" />
          </div>
          <span className="tour-tag">{current.tag}</span>
        </div>

        <div className="tour-copy" key={step}>
          <h2 className="tour-title">{current.title}</h2>
          <p className="tour-body">{current.body}</p>
        </div>

        <div className="tour-foot">
          <div className="tour-dots">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                className={`tour-dot ${i === step ? "on" : ""}`}
                onClick={() => setStep(i)}
                aria-label={`Step ${i + 1}`}
              />
            ))}
          </div>

          <div className="tour-btns">
            {step > 0 && (
              <button
                className="tour-back"
                onClick={() => setStep((s) => s - 1)}
                type="button"
              >
                <ArrowLeft size={12} weight="bold" />
              </button>
            )}

            <button
              className="tour-next"
              onClick={() => (last ? close() : setStep((s) => s + 1))}
              type="button"
            >
              {last ? "Got it" : "Next"}
              {!last && <ArrowRight size={12} weight="bold" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
