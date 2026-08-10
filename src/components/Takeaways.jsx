import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Quotes, TrendDown, TrendUp, X } from "@phosphor-icons/react";

/**
 * Bullish and bearish points, each showing the exact transcript quote it came
 * from. Being able to check the source is what separates this from a summariser
 * you have to take on faith.
 *
 * The quote used to expand inside the panel, which pushed the Bearish panel and
 * everything under it down the page — the whole layout lurched every time you
 * checked a source. It now opens in a popover positioned over the page, so
 * nothing moves. Only one is open at a time, and it closes on Escape, on an
 * outside click, or on scroll (rather than drifting away from the point it
 * belongs to).
 */

const CARD_W = 330;
const GAP = 10;
const EDGE = 12;

function QuotePopover({ anchor, source, tone, onClose }) {
  const card = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor || !card.current) return;

    const a = anchor.getBoundingClientRect();
    const h = card.current.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = Math.min(CARD_W, vw - EDGE * 2);

    // Below the point by default; above it when there is not room below.
    const below = a.bottom + GAP;
    const fitsBelow = below + h <= vh - EDGE;
    const top = fitsBelow ? below : Math.max(EDGE, a.top - GAP - h);

    const left = Math.min(Math.max(EDGE, a.left), vw - width - EDGE);

    setPos({ top, left, width });
  }, [anchor, source]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (!card.current?.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    // Closing on scroll is deliberate. Tracking the anchor every frame is the
    // alternative, and a quote box floating across a scrolling page looks worse
    // than one that politely gets out of the way.
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [anchor, onClose]);

  return (
    <div
      ref={card}
      className={`quote-pop ${tone} ${pos ? "placed" : ""}`}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
      role="dialog"
      aria-label="Source quote"
    >
      <div className="quote-pop-head">
        <Quotes size={12} weight="fill" />
        <span>
          {source.speaker}
          {source.section ? ` · ${source.section}` : ""}
        </span>
        <button onClick={onClose} aria-label="Close quote" type="button">
          <X size={11} weight="bold" />
        </button>
      </div>

      <blockquote>{source.excerpt}</blockquote>
    </div>
  );
}

function Point({ id, text, source, tone, active, onToggle }) {
  const btn = useRef(null);
  const hasSource = Boolean(source?.excerpt);

  return (
    <li className={hasSource ? "has-source" : ""}>
      <Check size={13} weight="bold" />

      <div className="point-body">
        <button
          ref={btn}
          className={`point-text ${active ? "on" : ""}`}
          onClick={() => hasSource && onToggle(id, btn.current, source, tone)}
          type="button"
          disabled={!hasSource}
          aria-expanded={active}
        >
          {text}
          {hasSource && <Quotes size={11} weight="fill" className="point-quote" />}
        </button>
      </div>
    </li>
  );
}

export default function Takeaways({ takeaways, evidence }) {
  const [open, setOpen] = useState(null);

  const bullish = evidence?.bullish?.length
    ? evidence.bullish
    : (takeaways?.bullish ?? []).map((text) => ({ text, source: null }));

  const bearish = evidence?.bearish?.length
    ? evidence.bearish
    : (takeaways?.bearish ?? []).map((text) => ({ text, source: null }));

  const anySource = Boolean(evidence?.bullish?.length || evidence?.bearish?.length);

  const close = useCallback(() => setOpen(null), []);

  const toggle = useCallback((id, anchor, source, tone) => {
    setOpen((cur) => (cur?.id === id ? null : { id, anchor, source, tone }));
  }, []);

  // A different call replacing this one should not leave a quote hanging over
  // the new dashboard.
  useEffect(() => setOpen(null), [evidence, takeaways]);

  const render = (list, tone, prefix) =>
    list.map((p, i) => {
      const id = `${prefix}-${i}`;
      return (
        <Point
          key={id}
          id={id}
          text={p.text}
          source={p.source}
          tone={tone}
          active={open?.id === id}
          onToggle={toggle}
        />
      );
    });

  return (
    <section className="glass">
      <div className="panel-head">
        <div>
          <h3 className="panel-title">Key Takeaways</h3>
          <p className="panel-sub">
            {anySource
              ? "Click any point to see the quote it came from"
              : "What moved the narrative on this call"}
          </p>
        </div>
      </div>

      <div className="takeaways">
        <div className="take-group take-bull">
          <h4 className="tone-green">
            <TrendUp size={15} weight="bold" />
            Bullish Points
          </h4>
          <ul>
            {bullish.length === 0 && <li className="none">None identified</li>}
            {render(bullish, "bull", "bull")}
          </ul>
        </div>

        <div className="take-group take-bear">
          <h4 className="tone-red">
            <TrendDown size={15} weight="bold" />
            Bearish Points
          </h4>
          <ul>
            {bearish.length === 0 && <li className="none">None identified</li>}
            {render(bearish, "bear", "bear")}
          </ul>
        </div>
      </div>

      {open && (
        <QuotePopover
          anchor={open.anchor}
          source={open.source}
          tone={open.tone}
          onClose={close}
        />
      )}
    </section>
  );
}
