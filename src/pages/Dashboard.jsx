import React from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import {
  ArrowCounterClockwise,
  ArrowRight,
  CurrencyDollar,
  Gauge,
  TrendUp,
  Warning,
} from "@phosphor-icons/react";

import UploadCard from "../components/UploadCard";
import FeaturedCall from "../components/FeaturedCall";
import MetricCard from "../components/MetricCard";
import SentimentChart from "../components/SentimentChart";
import Takeaways from "../components/Takeaways";

import { sentimentSpark } from "../data/mockData";

const GUIDANCE_STEPS = ["Lowered", "Maintained", "Raised"];

export default function Dashboard({
  call,
  prices,
  status,
  error,
  onFile,
  onReset,
  onViewFull,
}) {
  const riskDots = 5;
  const filled = Math.min(call.riskFlags ?? 0, riskDots);

  // The sparkline is the real tone arc when we have one, so the little chart
  // under Sentiment means something instead of decorating the card.
  const spark = call.timeline?.length
    ? call.timeline.map((s) => ({ v: s.score }))
    : sentimentSpark;

  const guidanceStep = GUIDANCE_STEPS.indexOf(call.guidance);

  return (
    <>
      {call.isDemo ? (
        <div className="demo-banner">
          <span className="demo-dot" />
          Showing a sample analysis. Upload a transcript to run CallPal for real.
        </div>
      ) : (
        <div className="demo-banner live">
          <span className="demo-dot live" />
          Analyzed from your transcript
          {call.wordCount ? ` · ${call.wordCount.toLocaleString()} words` : ""}
          <button className="demo-reset" onClick={onReset} type="button">
            <ArrowCounterClockwise size={12} weight="bold" />
            Back to sample
          </button>
        </div>
      )}

      <section className="hero-grid">
        <UploadCard onFile={onFile} status={status} error={error} />
        <FeaturedCall call={call} prices={prices} onViewFull={onViewFull} />
      </section>

      <section className="metrics">
        <MetricCard
          label="Sentiment"
          icon={Gauge}
          value={call.sentiment}
          suffix="/100"
          note={call.sentimentLabel}
          tone="tone-green"
        >
          <div className="metric-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark}>
                <defs>
                  <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0f9b6c" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#0f9b6c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#0f9b6c"
                  strokeWidth={1.8}
                  fill="url(#spark)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </MetricCard>

        <MetricCard
          label="Guidance"
          icon={TrendUp}
          value={call.guidance}
          note={call.guidanceNote}
          tone="tone-violet"
        >
          {/* Guidance is categorical, so a bar chart would be decoration.
              This lights the step management actually took. */}
          <div className="guide-steps">
            {GUIDANCE_STEPS.map((step, i) => (
              <span
                key={step}
                className={`guide-step ${i === guidanceStep ? "on" : ""}`}
                title={step}
              />
            ))}
            <em>{guidanceStep === -1 ? "No guidance given" : call.guidance}</em>
          </div>
        </MetricCard>

        <MetricCard
          label="Revenue Outlook"
          icon={CurrencyDollar}
          value={call.revenueOutlook}
          note={call.revenueNote}
        />

        <MetricCard
          label="Risk Flags"
          icon={Warning}
          value={call.riskFlags}
          note={call.riskLevel}
          tone="tone-orange"
        >
          {call.riskList?.length > 0 && (
            <div className="risk-list" title={call.riskList.join(" · ")}>
              {call.riskList[0]}
              {call.riskList.length > 1 && ` +${call.riskList.length - 1} more`}
            </div>
          )}
          <div className="dots">
            {Array.from({ length: riskDots }, (_, i) => (
              <i key={i} className={i < filled ? "on" : ""} />
            ))}
          </div>
        </MetricCard>
      </section>

      <section className="bottom-grid">
        <SentimentChart
          timeline={call.timeline}
          isDemo={call.isDemo}
          prices={prices}
          ticker={call.ticker}
        />
        <Takeaways takeaways={call.takeaways} evidence={call.evidence} />
      </section>

      {/* "Inside the call" used to live here, which made the dashboard scroll on
          and on and duplicated what the full analysis page now shows properly.
          The dashboard is the summary; the detail has its own page. */}
      {!call.isDemo && (
        <button className="fa-jump" onClick={onViewFull} type="button">
          <span>
            <strong>Read the full analysis</strong>
            Every figure, the whole Q&amp;A, and each claim with its quote
          </span>
          <ArrowRight size={13} weight="bold" />
        </button>
      )}

      <footer className="foot">
        <span>
          All analysis is AI-generated and for informational purposes only.
        </span>
        <span>Not investment advice</span>
      </footer>
    </>
  );
}
