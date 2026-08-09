import React from "react";

export default function MetricCard({
  label,
  icon: Icon,
  value,
  suffix,
  note,
  tone = "",
  children,
}) {
  return (
    <article className="metric glass">
      <div className="metric-head">
        <Icon size={14} weight="duotone" />
        {label}
      </div>

      <div className={`metric-value ${tone}`}>
        {value}
        {suffix && <small> {suffix}</small>}
      </div>

      {note && <div className="metric-note">{note}</div>}

      {children}
    </article>
  );
}
