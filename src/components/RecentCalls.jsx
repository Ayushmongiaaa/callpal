import React from "react";
import { CaretRight } from "@phosphor-icons/react";
import CompanyLogo from "./CompanyLogo";

export default function RecentCalls({ calls = [], onOpen, onViewAll }) {
  return (
    <section className="glass">
      <div className="recent-head">
        <h3 className="panel-title">Recent Calls</h3>
        <button className="view-all" onClick={onViewAll}>
          View all
        </button>
      </div>

      <div className="recent-list">
        {calls.map((call) => {
          const clickable = Boolean(call.id && onOpen);

          return (
            <div
              className={`recent-item ${clickable ? "clickable" : ""}`}
              key={call.id || call.ticker}
              onClick={clickable ? () => onOpen(call.id) : undefined}
              role={clickable ? "button" : undefined}
            >
              <div className="recent-logo">
                <CompanyLogo ticker={call.ticker} website={call.website} size={19} />
              </div>

              <div style={{ minWidth: 0 }}>
                <strong>{call.company}</strong>
                <span>
                  {call.quarter} · {call.date}
                </span>
              </div>

              {clickable && (
                <CaretRight size={13} weight="bold" className="recent-go" />
              )}
            </div>
          );
        })}
      </div>

      <button className="browse-all" onClick={onViewAll}>
        Browse All Companies
      </button>
    </section>
  );
}
