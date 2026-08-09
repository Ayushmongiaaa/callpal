import React, { useState } from "react";
import { Check, Quotes, TrendDown, TrendUp } from "@phosphor-icons/react";

/**
 * Bullish and bearish points, each expandable to the exact transcript quote it
 * came from. Being able to check the source is what separates this from a
 * summariser you have to take on faith.
 */
function Point({ text, source, tone }) {
  const [open, setOpen] = useState(false);
  const hasSource = Boolean(source?.excerpt);

  return (
    <li className={hasSource ? "has-source" : ""}>
      <Check size={13} weight="bold" />

      <div className="point-body">
        <button
          className="point-text"
          onClick={() => hasSource && setOpen((o) => !o)}
          type="button"
          disabled={!hasSource}
        >
          {text}
          {hasSource && <Quotes size={11} weight="fill" className="point-quote" />}
        </button>

        {open && hasSource && (
          <div className={`point-source ${tone}`}>
            <span className="point-who">
              {source.speaker}
              {source.section ? ` · ${source.section}` : ""}
            </span>
            <blockquote>{source.excerpt}</blockquote>
          </div>
        )}
      </div>
    </li>
  );
}

export default function Takeaways({ takeaways, evidence }) {
  const bullish = evidence?.bullish?.length
    ? evidence.bullish
    : (takeaways?.bullish ?? []).map((text) => ({ text, source: null }));

  const bearish = evidence?.bearish?.length
    ? evidence.bearish
    : (takeaways?.bearish ?? []).map((text) => ({ text, source: null }));

  const anySource = Boolean(evidence?.bullish?.length || evidence?.bearish?.length);

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
            {bullish.map((p) => (
              <Point key={p.text} text={p.text} source={p.source} tone="bull" />
            ))}
          </ul>
        </div>

        <div className="take-group take-bear">
          <h4 className="tone-red">
            <TrendDown size={15} weight="bold" />
            Bearish Points
          </h4>
          <ul>
            {bearish.length === 0 && <li className="none">None identified</li>}
            {bearish.map((p) => (
              <Point key={p.text} text={p.text} source={p.source} tone="bear" />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
