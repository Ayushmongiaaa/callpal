import React from "react";
import {
  ArrowRight,
  CalendarBlank,
  Clock,
  DownloadSimple,
} from "@phosphor-icons/react";
import CompanyLogo from "./CompanyLogo";
import GlassCubes from "./GlassCubes";
import { downloadReport } from "../utils/report";

export default function FeaturedCall({ call }) {
  // Both of these did nothing before. A control that does not respond reads as
  // unfinished no matter how good the work behind it is.
  function viewFullAnalysis() {
    document
      .querySelector(".breakdown")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <section className="featured glass">
      <div>
        <span className="badge">Featured Call</span>

        <h2>
          {call.company.split(" ")[0]} {call.quarter} Earnings Call
        </h2>

        <div className="featured-meta">
          <span>
            <i className="ticker-dot">
              <CompanyLogo ticker={call.ticker} website={call.website} size={14} />
            </i>
            {call.company}
          </span>
          <span>
            <CalendarBlank size={14} weight="duotone" />
            {call.date}
          </span>
          <span>
            <Clock size={14} weight="duotone" />
            {call.duration}
          </span>
        </div>

        <p className="blurb">{call.summary}</p>

        <div className="featured-actions">
          <button
            className="btn-primary"
            onClick={viewFullAnalysis}
            disabled={call.isDemo}
            title={
              call.isDemo
                ? "Analyze a call to see the full breakdown"
                : "Jump to the section-by-section breakdown"
            }
            type="button"
          >
            View Full Analysis
            <ArrowRight size={14} weight="bold" />
          </button>

          <button
            className="btn-ghost"
            onClick={() => downloadReport(call)}
            disabled={call.isDemo}
            title={
              call.isDemo
                ? "Analyze a call to download its report"
                : "Download this analysis as a Markdown file"
            }
            type="button"
          >
            Download Report
            <DownloadSimple size={14} weight="bold" />
          </button>
        </div>
      </div>

      <div className="cube-wrap">
        <GlassCubes ticker={call.ticker} website={call.website} />
      </div>
    </section>
  );
}
