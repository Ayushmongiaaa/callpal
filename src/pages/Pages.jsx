import React, { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  BookmarkSimple,
  CalendarBlank,
  CloudArrowDown,
  FileText,
  Microphone,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import CompanyLogo from "../components/CompanyLogo";
import { fetchPrices } from "../services/api";

/**
 * Every page here is built from calls that have actually been analyzed and
 * stored. Nothing is invented: if the library is empty, the page says so
 * rather than showing placeholder numbers.
 */

function Empty({ title, body }) {
  return (
    <section className="glass page-empty">
      <FileText size={30} weight="duotone" />
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

/**
 * Placeholder rows shown while the library is still being fetched.
 *
 * Without this the list pages render their empty state first — "No calls yet" —
 * and then swap to real content, which reads as a bug rather than a load.
 */
function Skeleton({ rows = 4 }) {
  return (
    <section className="glass skeleton" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk-dot" />
          <span className="sk-line" style={{ width: `${58 - i * 6}%` }} />
          <span className="sk-line sk-short" />
        </div>
      ))}
    </section>
  );
}

function PageHead({ title, sub }) {
  return (
    <div className="page-head">
      <h2>{title}</h2>
      <p>{sub}</p>
    </div>
  );
}

function fmtDate(value) {
  if (!value) return "Date not stated";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Second Quarter Fiscal 2026" is too long for an axis label; "Q2 26" is not. */
function shortQuarter(quarter) {
  if (!quarter) return "";

  const q = quarter.match(/(?:^|\s)Q?([1-4])(?:st|nd|rd|th)?\b/i)
    || quarter.match(/\b(first|second|third|fourth)\b/i);
  const year = quarter.match(/(\d{4})/);

  const words = { first: 1, second: 2, third: 3, fourth: 4 };
  const number = q ? words[String(q[1]).toLowerCase()] || q[1] : "";

  // "FY2025" has a year but no quarter number — "Q 25" would be nonsense, so
  // fall back to the raw text rather than inventing a quarter.
  if (!number) return quarter.slice(0, 8);

  return `Q${number}${year ? " " + year[1].slice(2) : ""}`.trim();
}

function sourceLabel(source) {
  if (source === "media") return "Audio or video";
  if (source === "fetched") return "Fetched by ticker";
  return "Uploaded transcript";
}

/* ------------------------------- Calls ------------------------------- */

export function CallsPage({ library, loaded = true, onOpen, onDelete }) {
  if (!loaded) return <Skeleton rows={5} />;

  if (!library.length) {
    return (
      <Empty
        title="No calls yet"
        body="Every transcript you analyze is stored here, so you can reopen it later without uploading again."
      />
    );
  }

  return (
    <>
      <PageHead
        title="Calls"
        sub={`${library.length} call${library.length > 1 ? "s" : ""} analyzed and stored`}
      />

      <section className="glass call-table">
        <table>
          <thead>
            <tr>
              <th>Company</th>
              <th>Quarter</th>
              <th>Date</th>
              <th>Source</th>
              <th>Length</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {library.map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="cell-company">
                    <span className="recent-logo">
                      <CompanyLogo ticker={c.ticker} website={c.website} size={17} />
                    </span>
                    <div>
                      <strong>{c.company}</strong>
                      <span>{c.ticker || "No ticker"}</span>
                    </div>
                  </div>
                </td>
                <td>{c.quarter || "—"}</td>
                <td className="num">{fmtDate(c.call_date)}</td>
                <td>
                  <span className={`src-chip ${c.source}`}>
                    {c.source === "media" ? (
                      <>
                        <Microphone size={11} weight="fill" /> Audio
                      </>
                    ) : c.source === "fetched" ? (
                      <>
                        <CloudArrowDown size={11} weight="fill" /> Fetched
                      </>
                    ) : (
                      <>
                        <FileText size={11} weight="fill" /> Transcript
                      </>
                    )}
                  </span>
                </td>
                <td className="num">{(c.word_count ?? 0).toLocaleString()} words</td>
                <td className="cell-actions">
                  <button onClick={() => onOpen(c.id)} className="row-open">
                    Open <ArrowRight size={11} weight="bold" />
                  </button>
                  <button
                    onClick={() => onDelete(c.id)}
                    className="row-del"
                    aria-label="Delete"
                  >
                    <Trash size={13} weight="bold" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ----------------------------- Watchlist ----------------------------- */

export function WatchlistPage({ library, loaded = true, onOpen }) {
  const companies = useMemo(() => {
    const map = new Map();

    library.forEach((c) => {
      if (!c.ticker) return;
      const existing = map.get(c.ticker);
      if (existing) {
        existing.calls += 1;
      } else {
        map.set(c.ticker, { ...c, calls: 1 });
      }
    });

    return [...map.values()];
  }, [library]);

  if (!loaded) return <Skeleton rows={4} />;

  if (!companies.length) {
    return (
      <Empty
        title="No companies tracked yet"
        body="Companies appear here automatically once you analyze a call with a ticker in it."
      />
    );
  }

  return (
    <>
      <PageHead
        title="Watchlist"
        sub={`${companies.length} compan${companies.length > 1 ? "ies" : "y"} from your analyzed calls`}
      />

      <section className="tile-grid">
        {companies.map((c) => (
          <button className="glass tile" key={c.ticker} onClick={() => onOpen(c.id)}>
            <span className="recent-logo">
              <CompanyLogo ticker={c.ticker} website={c.website} size={22} />
            </span>
            <strong>{c.company}</strong>
            <span className="tile-ticker">{c.ticker}</span>
            <span className="tile-meta">
              {c.calls} call{c.calls > 1 ? "s" : ""} analyzed
            </span>
          </button>
        ))}
      </section>
    </>
  );
}

/* ----------------------------- Calendar ------------------------------ */

export function CalendarPage({ library, loaded = true, onOpen }) {
  const dated = library.filter((c) => c.call_date);

  const byMonth = useMemo(() => {
    const map = new Map();

    [...dated]
      .sort((a, b) => (a.call_date < b.call_date ? 1 : -1))
      .forEach((c) => {
        const key = c.call_date.slice(0, 7);
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(c);
      });

    return [...map.entries()];
  }, [dated]);

  if (!loaded) return <Skeleton rows={4} />;

  if (!dated.length) {
    return (
      <Empty
        title="No dated calls yet"
        body="Calls appear on this timeline once CallPal finds a date in the transcript."
      />
    );
  }

  return (
    <>
      <PageHead title="Calendar" sub="Your analyzed calls, most recent first" />

      {byMonth.map(([month, calls]) => (
        <section className="glass month-block" key={month}>
          <div className="month-head">
            <CalendarBlank size={14} weight="duotone" />
            {new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
            <span>{calls.length}</span>
          </div>

          {calls.map((c) => (
            <button className="month-row" key={c.id} onClick={() => onOpen(c.id)}>
              <span className="month-day">{c.call_date.slice(8)}</span>
              <span className="recent-logo">
                <CompanyLogo ticker={c.ticker} website={c.website} size={16} />
              </span>
              <div>
                <strong>{c.company}</strong>
                <span>{c.quarter}</span>
              </div>
              <ArrowRight size={12} weight="bold" />
            </button>
          ))}
        </section>
      ))}
    </>
  );
}

/* ----------------------------- Insights ------------------------------ */

export function InsightsPage({ library, loaded = true }) {
  if (!loaded) return <Skeleton rows={4} />;

  if (!library.length) {
    return (
      <Empty
        title="No insights yet"
        body="Analyze a few calls and this page will summarise them together."
      />
    );
  }

  const words = library.reduce((sum, c) => sum + (c.word_count ?? 0), 0);
  const media = library.filter((c) => c.source === "media").length;
  const fetched = library.filter((c) => c.source === "fetched").length;
  const tickers = new Set(library.filter((c) => c.ticker).map((c) => c.ticker));

  const stats = [
    { label: "Calls analyzed", value: library.length },
    { label: "Companies", value: tickers.size },
    { label: "Words processed", value: words.toLocaleString() },
    { label: "From audio or video", value: media },
    { label: "Fetched by ticker", value: fetched },
  ];

  return (
    <>
      <PageHead title="Insights" sub="Totals across everything you have analyzed" />

      <section className="metrics">
        {stats.map((s) => (
          <article className="metric glass" key={s.label}>
            <div className="metric-head">{s.label}</div>
            <div className="metric-value">{s.value}</div>
          </article>
        ))}
      </section>

      <section className="glass call-table">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Most recent</h3>
            <p className="panel-sub">The last calls added to your library</p>
          </div>
        </div>

        <table>
          <tbody>
            {library.slice(0, 6).map((c) => (
              <tr key={c.id}>
                <td>
                  <div className="cell-company">
                    <span className="recent-logo">
                      <CompanyLogo ticker={c.ticker} website={c.website} size={17} />
                    </span>
                    <div>
                      <strong>{c.company}</strong>
                      <span>
                        {c.quarter} · {fmtDate(c.call_date)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="num" style={{ textAlign: "right" }}>
                  {(c.word_count ?? 0).toLocaleString()} words
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

/* ------------------------------ Trends ------------------------------- */

const GUIDANCE_TONE = {
  Raised: "#34d399",
  Maintained: "#a78bfa",
  Lowered: "#f87171",
};

function ToneTip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};

  return (
    <div className="tip">
      <div className="tip-label">
        {row.company} · {row.quarter || "quarter not stated"}
      </div>
      <div className="tip-row">
        <span>Tone</span>
        <strong className={row.sentiment >= 50 ? "tone-green" : "tone-red"}>
          {row.sentiment}/100
        </strong>
      </div>
      <div className="tip-row">
        <span>Guidance</span>
        <strong>{row.guidance}</strong>
      </div>
      {row.revenue && (
        <div className="tip-row">
          <span>Revenue outlook</span>
          <strong>{row.revenue}</strong>
        </div>
      )}
      <div className="tip-note">{fmtDate(row.call_date)}</div>
    </div>
  );
}

export function TrendsPage({ library, loaded = true }) {
  const scored = useMemo(
    () =>
      library
        .filter((c) => typeof c.sentiment === "number")
        .map((c) => ({
          id: c.id,
          label: `${c.ticker || c.company.slice(0, 6)} ${shortQuarter(c.quarter)}`.trim(),
          company: c.company,
          quarter: c.quarter,
          call_date: c.call_date,
          sentiment: c.sentiment,
          guidance: c.guidance || "Not Given",
          revenue: c.revenue_outlook,
          risks: c.risk_count ?? 0,
        }))
        // Oldest first so the line reads left to right as time passing.
        .sort((a, b) => (a.call_date || "").localeCompare(b.call_date || "")),
    [library],
  );

  if (!loaded) return <Skeleton rows={4} />;

  if (scored.length < 2) {
    return (
      <Empty
        title="Not enough calls to show a trend"
        body="Analyze at least two calls and this page charts how management's tone and guidance moved between them."
      />
    );
  }

  const raised = scored.filter((c) => c.guidance === "Raised").length;
  const lowered = scored.filter((c) => c.guidance === "Lowered").length;
  const average = Math.round(
    scored.reduce((sum, c) => sum + c.sentiment, 0) / scored.length,
  );

  return (
    <>
      <PageHead
        title="Trends"
        sub="Management tone and guidance across every call you have analyzed"
      />

      <section className="metrics">
        {[
          { label: "Average tone", value: `${average}/100` },
          { label: "Guidance raised", value: raised },
          { label: "Guidance lowered", value: lowered },
          { label: "Calls charted", value: scored.length },
        ].map((s) => (
          <article className="metric glass" key={s.label}>
            <div className="metric-head">{s.label}</div>
            <div className="metric-value">{s.value}</div>
          </article>
        ))}
      </section>

      <section className="glass chart-panel">
        <div className="panel-head">
          <div>
            <h3 className="panel-title">Management tone by call</h3>
            <p className="panel-sub">
              Bar colour is the guidance direction on that call — green raised,
              red lowered
            </p>
          </div>
        </div>

        <div className="chart-body" style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={scored} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid
                stroke="rgba(167,139,250,0.08)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={{ fill: "#8a82ab", fontSize: 10 }}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                width={34}
                tick={{ fill: "#8a82ab", fontSize: 10 }}
              />
              <Tooltip cursor={{ fill: "rgba(167,139,250,0.06)" }} content={<ToneTip />} />
              <Bar dataKey="sentiment" radius={[5, 5, 0, 0]} isAnimationActive={false}>
                {scored.map((c) => (
                  <Cell key={c.id} fill={GUIDANCE_TONE[c.guidance] || "#5b4d85"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="legend" style={{ paddingTop: 10 }}>
          {Object.entries(GUIDANCE_TONE).map(([name, colour]) => (
            <span key={name}>
              <i style={{ background: colour }} />
              {name}
            </span>
          ))}
          <span>
            <i style={{ background: "#5b4d85" }} />
            Not given
          </span>
        </div>
      </section>
    </>
  );
}

/* ------------------------------ Alerts ------------------------------- */

export function AlertsPage({ library, loaded = true, onOpen }) {
  // Every risk from every stored call, newest first — a page that only showed
  // the open call's risks was really just a slice of the dashboard.
  const alerts = useMemo(
    () =>
      library.flatMap((c) =>
        (c.risk_flags ?? []).map((risk) => ({
          key: `${c.id}-${risk}`,
          risk,
          call: c,
        })),
      ),
    [library],
  );

  if (!loaded) return <Skeleton rows={5} />;

  if (!alerts.length) {
    return (
      <Empty
        title="No risks flagged"
        body="Risks CallPal finds in a call show up here, with the call they came from."
      />
    );
  }

  const companies = new Set(alerts.map((a) => a.call.ticker || a.call.company));

  return (
    <>
      <PageHead
        title="Alerts"
        sub={`${alerts.length} risk${alerts.length > 1 ? "s" : ""} flagged across ${companies.size} compan${companies.size > 1 ? "ies" : "y"}`}
      />

      <section className="glass alert-list">
        {alerts.map(({ key, risk, call }) => (
          <button className="alert-row" key={key} onClick={() => onOpen(call.id)}>
            <span className="alert-icon">
              <Warning size={14} weight="fill" />
            </span>

            <div>
              <strong>{risk}</strong>
              <span>
                {call.company}
                {call.quarter ? ` · ${call.quarter}` : ""}
                {call.call_date ? ` · ${fmtDate(call.call_date)}` : ""}
              </span>
            </div>

            <span className="recent-logo">
              <CompanyLogo ticker={call.ticker} website={call.website} size={16} />
            </span>
          </button>
        ))}
      </section>
    </>
  );
}

/* ------------------------------ Compare ------------------------------ */

function Delta({ from, to, suffix = "" }) {
  if (typeof from !== "number" || typeof to !== "number") return null;

  const change = to - from;
  if (change === 0) return <span className="delta flat">no change</span>;

  return (
    <span className={`delta ${change > 0 ? "up" : "down"}`}>
      {change > 0 ? "+" : ""}
      {change}
      {suffix}
    </span>
  );
}

const SAVED_KEY = "callpal.savedComparisons";

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(SAVED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    // Private browsing, or a corrupted value. Neither is worth an error.
    return [];
  }
}

function persistSaved(list) {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    /* nothing to do — saving is a convenience, not a requirement */
  }
}

export function ComparePage({ library, loaded = true, onOpen }) {
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [prices, setPrices] = useState({});
  const [saved, setSaved] = useState(loadSaved);

  // Two calls from the same company are the interesting comparison, so pick
  // that pairing by default when the library contains one.
  const preferred = useMemo(() => {
    const byTicker = {};

    for (const c of library) {
      if (!c.ticker) continue;
      (byTicker[c.ticker] ||= []).push(c);
    }

    const repeated = Object.values(byTicker).find((group) => group.length > 1);

    if (repeated) {
      const ordered = [...repeated].sort((a, b) =>
        (a.call_date || "").localeCompare(b.call_date || ""),
      );
      return [ordered[0].id, ordered[ordered.length - 1].id];
    }

    return [library[0]?.id ?? "", library[1]?.id ?? ""];
  }, [library]);

  const a = library.find((c) => c.id === left) ?? library.find((c) => c.id === preferred[0]);
  const b = library.find((c) => c.id === right) ?? library.find((c) => c.id === preferred[1]);

  // How the market reacted to each call — the comparison people actually care
  // about, and it is real data rather than a word count.
  useEffect(() => {
    let cancelled = false;

    [a, b].forEach((call) => {
      if (!call?.ticker || !call.call_date || prices[call.id] !== undefined) return;

      fetchPrices(call.ticker, call.call_date).then((data) => {
        if (!cancelled) setPrices((p) => ({ ...p, [call.id]: data }));
      });
    });

    return () => {
      cancelled = true;
    };
  }, [a, b, prices]);

  if (!loaded) return <Skeleton rows={5} />;

  if (library.length < 2) {
    return (
      <Empty
        title="Need two calls to compare"
        body="Analyze a second call — ideally the same company a quarter apart — and this page shows what changed between them."
      />
    );
  }

  // A saved comparison is just the pair of call ids plus a label, so it stays
  // valid as long as both calls are still in the library.
  const live = saved.filter(
    (s) => library.some((c) => c.id === s.a) && library.some((c) => c.id === s.b),
  );

  const alreadySaved = live.some(
    (s) => (s.a === a.id && s.b === b.id) || (s.a === b.id && s.b === a.id),
  );

  function save() {
    if (alreadySaved) return;

    const entry = {
      id: `${a.id}-${b.id}`,
      a: a.id,
      b: b.id,
      label: `${a.ticker || a.company} ${shortQuarter(a.quarter)} vs ${b.ticker || b.company} ${shortQuarter(b.quarter)}`,
    };

    const next = [entry, ...live].slice(0, 8);
    setSaved(next);
    persistSaved(next);
  }

  function drop(id) {
    const next = live.filter((s) => s.id !== id);
    setSaved(next);
    persistSaved(next);
  }

  const sameCompany = a.ticker && a.ticker === b.ticker;
  const reactionA = prices[a.id]?.reaction_pct;
  const reactionB = prices[b.id]?.reaction_pct;

  const rows = [
    {
      label: "Quarter",
      a: a.quarter || "Not stated",
      b: b.quarter || "Not stated",
    },
    {
      label: "Call date",
      a: fmtDate(a.call_date),
      b: fmtDate(b.call_date),
      num: true,
    },
    {
      label: "Management tone",
      a: a.sentiment != null ? `${a.sentiment}/100 · ${a.sentiment_label}` : "—",
      b: b.sentiment != null ? `${b.sentiment}/100 · ${b.sentiment_label}` : "—",
      delta: <Delta from={a.sentiment} to={b.sentiment} />,
      num: true,
    },
    {
      label: "Guidance",
      a: a.guidance || "Not Given",
      b: b.guidance || "Not Given",
      tone: true,
    },
    {
      label: "Revenue outlook",
      a: a.revenue_outlook || "Not given",
      b: b.revenue_outlook || "Not given",
      num: true,
    },
    {
      label: "Risks flagged",
      a: a.risk_count ?? 0,
      b: b.risk_count ?? 0,
      delta: <Delta from={a.risk_count} to={b.risk_count} />,
      num: true,
    },
    {
      label: "Price move next session",
      a: reactionA != null ? `${reactionA > 0 ? "+" : ""}${reactionA.toFixed(2)}%` : "—",
      b: reactionB != null ? `${reactionB > 0 ? "+" : ""}${reactionB.toFixed(2)}%` : "—",
      num: true,
    },
  ];

  return (
    <>
      <PageHead
        title="Compare"
        sub={
          sameCompany
            ? `${a.company} across two quarters`
            : "Two analyzed calls, side by side"
        }
      />

      {live.length > 0 && (
        <section className="saved-strip">
          {live.map((s) => (
            <span
              className={`saved-chip ${
                (s.a === a.id && s.b === b.id) ? "on" : ""
              }`}
              key={s.id}
            >
              <button
                onClick={() => {
                  setLeft(s.a);
                  setRight(s.b);
                }}
                type="button"
              >
                {s.label}
              </button>
              <button
                className="saved-drop"
                onClick={() => drop(s.id)}
                aria-label={`Remove ${s.label}`}
                type="button"
              >
                <X size={10} weight="bold" />
              </button>
            </span>
          ))}
        </section>
      )}

      <section className="glass compare">
        <div className="compare-pickers">
          {[
            [a.id, setLeft],
            [b.id, setRight],
          ].map(([value, set], i) => (
            <select key={i} value={value} onChange={(e) => set(e.target.value)}>
              {library.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.ticker || c.company} — {c.quarter || "no quarter"}
                </option>
              ))}
            </select>
          ))}
        </div>

        <table className="compare-table">
          <thead>
            <tr>
              <th />
              <td className="compare-head">
                <span className="recent-logo">
                  <CompanyLogo ticker={a.ticker} website={a.website} size={16} />
                </span>
                {a.company}
              </td>
              <td className="compare-head">
                <span className="recent-logo">
                  <CompanyLogo ticker={b.ticker} website={b.website} size={16} />
                </span>
                {b.company}
              </td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                <td
                  className={`${row.tone ? `guide-${row.a}` : ""} ${row.num ? "num" : ""}`}
                >
                  {row.a}
                </td>
                <td
                  className={`${row.tone ? `guide-${row.b}` : ""} ${row.num ? "num" : ""}`}
                >
                  {row.b}
                  {row.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sameCompany && (
          <div className="compare-story">
            <strong>What changed</strong>
            <p>
              Between {a.quarter || "the earlier call"} and{" "}
              {b.quarter || "the later one"}, management went from{" "}
              <em>{a.guidance || "no guidance"}</em> to{" "}
              <em>{b.guidance || "no guidance"}</em>
              {a.sentiment != null && b.sentiment != null && (
                <>
                  {" "}
                  and their tone moved {b.sentiment > a.sentiment ? "up" : "down"} from{" "}
                  <span className="num-inline">{a.sentiment}</span> to{" "}
                  <span className="num-inline">{b.sentiment}</span> out of 100
                </>
              )}
              .
            </p>
          </div>
        )}

        <div className="compare-lists">
          {[a, b].map((call, i) => (
            <div key={call.id + i}>
              <h4>{call.ticker || call.company}</h4>
              {(call.risk_flags ?? []).length > 0 ? (
                <ul>
                  {call.risk_flags.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="compare-none">No risks flagged</p>
              )}
            </div>
          ))}
        </div>

        <div className="compare-actions">
          <button className="btn-primary" onClick={save} disabled={alreadySaved}>
            <BookmarkSimple size={13} weight={alreadySaved ? "fill" : "bold"} />
            {alreadySaved ? "Saved" : "Save this comparison"}
          </button>
          <button className="btn-ghost" onClick={() => onOpen(a.id)}>
            Open {a.ticker || a.company}
          </button>
          <button className="btn-ghost" onClick={() => onOpen(b.id)}>
            Open {b.ticker || b.company}
          </button>
        </div>
      </section>
    </>
  );
}
