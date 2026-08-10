import React from "react";

/**
 * "Management did not say" is a legitimate finding, not a number.
 *
 * The model returns these as free text, and they were being rendered in the
 * same 30px tabular-numeral face as "$28.0B" — so a whole sentence sat in a
 * slot built for a figure, and the wording drifted between cards ("Not Given"
 * on one, "Not given" on the next). Both are handled here rather than at each
 * call site, so every card that can be empty behaves the same way.
 */
const ABSENT = /^(not\s*given|not\s*stated|not\s*provided|none|n\/?a|unknown|-{1,2})$/i;

export default function MetricCard({
  label,
  icon: Icon,
  value,
  suffix,
  note,
  tone = "",
  children,
}) {
  const absent = typeof value === "string" && ABSENT.test(value.trim());

  return (
    <article className="metric glass">
      <div className="metric-head">
        <Icon size={14} weight="duotone" />
        {label}
      </div>

      <div className={`metric-value ${absent ? "is-absent" : tone}`}>
        {absent ? "Not stated" : value}
        {suffix && !absent && <small> {suffix}</small>}
      </div>

      {note && <div className="metric-note">{note}</div>}

      {children}
    </article>
  );
}
