import React, { useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowsOut, Info, Warning } from "@phosphor-icons/react";
import CandleChart from "./CandleChart";

/**
 * Two views of the same call.
 *
 * Price Reaction is real OHLC from Yahoo Finance around the call date.
 * Sentiment Over Time is the model's tone score for each ordered slice of the
 * transcript — so the dip you usually see is management getting pressed in Q&A,
 * not a decorative curve.
 */

function ToneTip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload ?? {};

  return (
    <div className="tip">
      <div className="tip-label">{row.section || "Call"}</div>
      <div className="tip-row">
        <span>Tone</span>
        <strong className={row.score >= 50 ? "tone-green" : "tone-red"}>
          {row.score}/100
        </strong>
      </div>
      {row.note && <div className="tip-note">{row.note}</div>}
    </div>
  );
}

/**
 * The marker on the line where prepared remarks end and Q&A begins.
 *
 * This was plain text positioned above the plot, which put it in an 8px margin
 * — so it was sliced in half and sat directly on the 100 gridline, unreadable.
 * A filled pill reads at a glance and cannot be confused with the grid, and the
 * chart now reserves the room it needs above the plot.
 */
function QaMarker({ viewBox }) {
  if (!viewBox) return null;

  const W = 32;
  const H = 16;

  // Centre the pill on the line, but keep it inside the plot at either edge.
  const left = Math.max(
    viewBox.x - W / 2,
    Math.min(viewBox.x - W / 2, viewBox.x + viewBox.width - W),
  );

  return (
    <g transform={`translate(${left}, ${Math.max(2, viewBox.y - H - 5)})`}>
      <rect width={W} height={H} rx={5} fill="#a78bfa" />
      <text
        x={W / 2}
        y={H / 2 + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="9.5"
        fontWeight="700"
        letterSpacing="0.2"
        fill="#17131f"
      >
        Q&amp;A
      </text>
    </g>
  );
}

export default function SentimentChart({ timeline = [], isDemo, prices, ticker }) {
  const hasPrices = Boolean(prices?.series?.length);
  const hasTone = timeline.length > 1;

  const [mode, setMode] = useState("Price Reaction");
  const showingPrice = mode === "Price Reaction" && hasPrices;

  const toneData = timeline.map((seg) => ({
    label: `${seg.position}%`,
    score: seg.score,
    section: seg.section,
    note: seg.note,
  }));

  // Where the prepared remarks give way to Q&A — the moment worth marking.
  const qaStart = toneData.findIndex((d) => (d.section || "").startsWith("Q&A"));

  const average = hasTone
    ? Math.round(toneData.reduce((sum, d) => sum + d.score, 0) / toneData.length)
    : null;

  const reaction = prices?.reaction_pct;
  const reactionUp = (reaction ?? 0) >= 0;

  return (
    <section className="glass">
      <div className="panel-head">
        <div>
          <h3 className="panel-title">
            Sentiment &amp; Price Reaction
            <Info size={13} weight="fill" className="title-info" />
          </h3>

          <div className="toggle">
            {["Price Reaction", "Sentiment Over Time"].map((option) => (
              <button
                key={option}
                className={`toggle-btn ${mode === option ? "on" : ""}`}
                onClick={() => setMode(option)}
                type="button"
                disabled={option === "Price Reaction" && !hasPrices}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="head-right">
          {showingPrice && reaction != null && (
            <div className={`change-box ${reactionUp ? "" : "down"}`}>
              <strong>
                {reactionUp ? "+" : ""}
                {reaction.toFixed(2)}%
              </strong>
              <span>Price Change (1D)</span>
            </div>
          )}

          {!showingPrice && average != null && (
            <div className={`change-box ${average >= 50 ? "" : "down"}`}>
              <strong>{average}</strong>
              <span>Average tone</span>
            </div>
          )}

          <ArrowsOut size={15} color="#8a82ab" weight="bold" />
        </div>
      </div>

      {showingPrice ? (
        <>
          <div className="legend">
            <span className="legend-candle">
              <i className="up" />
              Up
              <i className="down" />
              Down
            </span>
            <span className="legend-price">{ticker} daily · Yahoo Finance</span>
            <span style={{ marginLeft: "auto", color: "var(--subtle)" }}>
              {prices.points} sessions around {prices.call_date}
            </span>
          </div>

          <div className="chart-body">
            <CandleChart series={prices.series} callDate={prices.call_date} />
          </div>
        </>
      ) : hasTone ? (
        <>
          <div className="legend">
            <span>
              <i style={{ background: "#a78bfa" }} />
              Management tone
            </span>
            <span>
              <i style={{ background: "rgba(248,113,113,0.6)" }} />
              Below neutral
            </span>
            <span style={{ marginLeft: "auto", color: "var(--subtle)" }}>
              Scored across {toneData.length} sections of the transcript
            </span>
          </div>

          <div className="chart-body">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={toneData}
                margin={{ top: 26, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="toneFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.34} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>

                <CartesianGrid
                  stroke="rgba(167,139,250,0.08)"
                  strokeDasharray="3 3"
                  vertical={false}
                />

                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={24}
                  tick={{ fill: "#8a82ab", fontSize: 10 }}
                />

                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                  tick={{ fill: "#8a82ab", fontSize: 10 }}
                />

                <Tooltip
                  content={<ToneTip />}
                  cursor={{ stroke: "#5b4d85", strokeDasharray: "4 4" }}
                />

                {/* 50 is the neutral line: below it management is hedging. */}
                <ReferenceLine
                  y={50}
                  stroke="rgba(248,113,113,0.45)"
                  strokeDasharray="4 4"
                />

                {qaStart > 0 && (
                  <ReferenceLine
                    x={toneData[qaStart].label}
                    stroke="rgba(167,139,250,0.55)"
                    strokeDasharray="3 3"
                    label={<QaMarker />}
                  />
                )}

                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="none"
                  fill="url(#toneFill)"
                  isAnimationActive={false}
                />

                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#a78bfa"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#a78bfa", strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : (
        <div className="chart-empty">
          <Warning size={22} weight="duotone" />
          <p>
            {isDemo
              ? "Upload a transcript to see how management's tone moves through the call."
              : "This call was too short to score section by section."}
          </p>
        </div>
      )}
    </section>
  );
}
