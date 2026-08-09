import React from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Candlestick chart.
 *
 * Recharts has no candlestick, so each session is drawn as a custom shape: a
 * thin wick spanning low→high and a thicker body spanning open→close. Green
 * when the session closed up, red when it closed down.
 *
 * The Bar underneath spans low→high, which gives the shape the correct pixel
 * geometry to draw into.
 */

const UP = "#34d399";
const DOWN = "#f87171";

function Candle({ x, y, width, height, payload }) {
  const { open, close, high, low } = payload;

  if (high === low) return null;

  const rising = close >= open;
  const colour = rising ? UP : DOWN;

  // Map a price to a y pixel within the low→high band this bar occupies.
  const priceToY = (price) => y + ((high - price) / (high - low)) * height;

  const bodyTop = priceToY(Math.max(open, close));
  const bodyBottom = priceToY(Math.min(open, close));
  const bodyHeight = Math.max(1, bodyBottom - bodyTop);

  const centre = x + width / 2;
  const bodyWidth = Math.max(2, Math.min(width * 0.62, 11));

  return (
    <g>
      <line
        x1={centre}
        x2={centre}
        y1={y}
        y2={y + height}
        stroke={colour}
        strokeWidth={1.1}
        opacity={0.85}
      />
      <rect
        x={centre - bodyWidth / 2}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={rising ? colour : colour}
        fillOpacity={rising ? 0.9 : 0.75}
        stroke={colour}
        strokeWidth={0.9}
        rx={1}
      />
    </g>
  );
}

function CandleTip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const d = payload[0]?.payload;
  if (!d) return null;

  const rising = d.close >= d.open;
  const change = d.open ? ((d.close / d.open - 1) * 100).toFixed(2) : "0.00";

  return (
    <div className="tip">
      <div className="tip-label">{d.date}</div>
      {[
        ["Open", d.open],
        ["High", d.high],
        ["Low", d.low],
        ["Close", d.close],
      ].map(([label, value]) => (
        <div className="tip-row" key={label}>
          <span>{label}</span>
          <strong>${Number(value).toFixed(2)}</strong>
        </div>
      ))}
      <div className="tip-row">
        <span>Change</span>
        <strong className={rising ? "tone-green" : "tone-red"}>
          {rising ? "+" : ""}
          {change}%
        </strong>
      </div>
    </div>
  );
}

export default function CandleChart({ series, callDate }) {
  const data = series.map((d) => ({
    ...d,
    label: d.date.slice(5),
    band: [d.low, d.high],
  }));

  const callLabel = data.find((d) => d.date >= callDate)?.label;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          stroke="rgba(167,139,250,0.08)"
          strokeDasharray="3 3"
          vertical={false}
        />

        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          minTickGap={30}
          tick={{ fill: "#8a82ab", fontSize: 10 }}
        />

        <YAxis
          axisLine={false}
          tickLine={false}
          width={54}
          domain={["dataMin - 3", "dataMax + 3"]}
          tick={{ fill: "#8a82ab", fontSize: 10 }}
          tickFormatter={(v) => `$${Math.round(v)}`}
        />

        <Tooltip
          content={<CandleTip />}
          cursor={{ fill: "rgba(167,139,250,0.06)" }}
        />

        {/* Mark the call itself so the reaction is readable at a glance. */}
        {callLabel && (
          <ReferenceLine
            x={callLabel}
            stroke="#c4b5fd"
            strokeDasharray="4 4"
            strokeWidth={1.2}
            label={{
              value: "Call",
              position: "top",
              fill: "#c4b5fd",
              fontSize: 10,
              fontWeight: 700,
            }}
          />
        )}

        <Bar dataKey="band" shape={<Candle />} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.date} />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}
