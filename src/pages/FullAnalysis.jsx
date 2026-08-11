import React from "react";
import {
  ArrowLeft,
  CalendarBlank,
  ChatCircleDots,
  DownloadSimple,
  FileText,
  Gauge,
  Megaphone,
  Quotes,
  Target,
  TrendDown,
  TrendUp,
  Users,
  Warning,
} from "@phosphor-icons/react";
import CompanyLogo from "../components/CompanyLogo";
import { downloadReport } from "../utils/report";

/**
 * The whole analysis, on its own page.
 *
 * "View full analysis" used to scroll to the bottom of the dashboard, which is
 * not a different view — it is the same information, further down. The point of
 * a full analysis is that it can be exhaustive: nothing collapsed, every quote
 * shown, every figure listed including the ones management never gave.
 *
 * The dashboard stays the summary. This is the document.
 */

function Row({ label, value }) {
  const stated = value && String(value).trim();

  return (
    <div className={`fa-row ${stated ? "" : "unstated"}`}>
      <span>{label}</span>
      <strong>{stated || "Not stated"}</strong>
    </div>
  );
}

function Section({ title, sub, icon: Icon, children, count }) {
  return (
    <section className="glass fa-section">
      <div className="fa-head">
        <div className="fa-head-icon">
          <Icon size={15} weight="duotone" />
        </div>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
        {count !== undefined && <span className="fa-count">{count}</span>}
      </div>

      {children}
    </section>
  );
}

function Evidence({ points, tone }) {
  if (!points.length) {
    return <p className="fa-none">None identified on this call.</p>;
  }

  return (
    <ul className={`fa-points ${tone}`}>
      {points.map((p, i) => (
        <li key={`${i}-${p.text}`}>
          <p className="fa-point-text">{p.text}</p>

          {p.source?.excerpt && (
            <blockquote>
              <span className="fa-who">
                <Quotes size={10} weight="fill" />
                {p.source.speaker}
                {p.source.section ? ` · ${p.source.section}` : ""}
              </span>
              {p.source.excerpt}
            </blockquote>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function FullAnalysis({ call, onBack }) {
  if (!call || call.isDemo) {
    return (
      <div className="fa-empty glass">
        <FileText size={22} weight="duotone" />
        <h3>No call analyzed yet</h3>
        <p>
          Upload a transcript or recording, or search a company, and the full
          analysis appears here.
        </p>
        <button onClick={onBack} type="button">
          <ArrowLeft size={12} weight="bold" />
          Back to dashboard
        </button>
      </div>
    );
  }

  const fin = call.financials ?? {};
  const outlook = call.outlook ?? {};
  const opening = call.opening ?? {};
  const speakers = call.speakers ?? [];
  const qa = call.qa ?? [];

  // Stating how many figures were missing is the honest version of a table with
  // gaps in it — it makes clear the blanks are the call's, not the app's.
  const figures = [
    ["Revenue", fin.revenue],
    ["Revenue growth", fin.revenue_growth],
    ["Net income", fin.net_income],
    ["EPS", fin.eps],
    ["Gross margin", fin.gross_margin],
    ["Operating margin", fin.operating_margin],
    ["Free cash flow", fin.free_cash_flow],
    ["Cash position", fin.cash_position],
    ["Debt", fin.debt],
  ];
  const missing = figures.filter(([, v]) => !v || !String(v).trim()).length;

  return (
    <div className="fa">
      <header className="fa-top glass">
        <button className="fa-back" onClick={onBack} type="button">
          <ArrowLeft size={13} weight="bold" />
          Dashboard
        </button>

        <div className="fa-id">
          <span className="fa-logo">
            <CompanyLogo ticker={call.ticker} website={call.website} size={26} />
          </span>

          <div>
            <h1>{call.company}</h1>
            <p>
              {[call.ticker, call.quarter, call.date].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>

        <button
          className="fa-download"
          onClick={() => downloadReport(call)}
          type="button"
        >
          <DownloadSimple size={13} weight="bold" />
          Download report
        </button>
      </header>

      {call.summary && <p className="fa-lede glass">{call.summary}</p>}

      <div className="fa-strip">
        <div className="fa-stat">
          <span>Management tone</span>
          <strong>
            {call.sentiment}
            <small>/100</small>
          </strong>
          <em>{call.sentimentLabel}</em>
        </div>

        <div className="fa-stat">
          <span>Guidance</span>
          <strong className="v">{call.guidance}</strong>
          <em>vs. prior quarter</em>
        </div>

        <div className="fa-stat">
          <span>Revenue outlook</span>
          <strong className={call.revenueOutlook === "Not given" ? "dim" : ""}>
            {call.revenueOutlook === "Not given" ? "Not stated" : call.revenueOutlook}
          </strong>
          <em>management guidance</em>
        </div>

        <div className="fa-stat">
          <span>Risks flagged</span>
          <strong>{call.riskFlags}</strong>
          <em>{call.riskLevel} concern</em>
        </div>

        <div className="fa-stat">
          <span>Source</span>
          <strong className="sm">{call.source}</strong>
          <em>{call.wordCount ? `${call.wordCount.toLocaleString()} words` : "—"}</em>
        </div>
      </div>

      <Section
        title="Who was on the call"
        sub="Named speakers and their roles, read from the transcript"
        icon={Users}
        count={speakers.length || undefined}
      >
        {speakers.length ? (
          <div className="fa-speakers">
            {speakers.map((s) => (
              <div className="fa-speaker" key={`${s.name}-${s.role}`}>
                <strong>{s.name}</strong>
                <span>{s.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="fa-none">No speakers were identified.</p>
        )}
      </Section>

      <Section
        title="How management framed the quarter"
        sub="The opening remarks, before any analyst had spoken"
        icon={Megaphone}
      >
        {opening.safe_harbor && (
          <p className="fa-flag">
            Safe-harbour statement present — forward-looking remarks were
            formally qualified.
          </p>
        )}

        {opening.ceo_summary ? (
          <p className="fa-body">{opening.ceo_summary}</p>
        ) : (
          <p className="fa-none">No opening summary was identified.</p>
        )}

        {(opening.drivers ?? []).length > 0 && (
          <>
            <h4 className="fa-sub">What moved the numbers</h4>
            <ul className="fa-list">
              {opening.drivers.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        title="Stated figures"
        sub={
          missing
            ? `${missing} of ${figures.length} were not given on this call`
            : "Every figure below was stated by management"
        }
        icon={Gauge}
      >
        <div className="fa-figures">
          {figures.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>

        <p className="fa-note">
          Blanks are figures management did not state. Nothing here is estimated
          or filled in from memory.
        </p>
      </Section>

      <Section
        title="What they said comes next"
        sub="Forward guidance and the challenges management named"
        icon={Target}
      >
        <div className="fa-figures">
          <Row label="Next quarter" value={outlook.next_quarter} />
          <Row label="Full year" value={outlook.full_year} />
        </div>

        {(outlook.challenges ?? []).length > 0 && (
          <>
            <h4 className="fa-sub">Challenges management named</h4>
            <ul className="fa-list">
              {outlook.challenges.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        title="The bull case, in their words"
        sub="Every point with the quote it came from"
        icon={TrendUp}
        count={(call.evidence?.bullish ?? []).length || undefined}
      >
        <Evidence points={call.evidence?.bullish ?? []} tone="bull" />
      </Section>

      <Section
        title="The bear case, in their words"
        sub="Every point with the quote it came from"
        icon={TrendDown}
        count={(call.evidence?.bearish ?? []).length || undefined}
      >
        <Evidence points={call.evidence?.bearish ?? []} tone="bear" />
      </Section>

      <Section
        title="Risks flagged"
        sub="Pulled from the call, not from outside sources"
        icon={Warning}
        count={(call.riskList ?? []).length || undefined}
      >
        {(call.riskList ?? []).length ? (
          <ul className="fa-list risks">
            {call.riskList.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p className="fa-none">No risks were flagged on this call.</p>
        )}
      </Section>

      <Section
        title="The Q&A in full"
        sub="Each exchange marked by whether the answer addressed the question"
        icon={ChatCircleDots}
        count={qa.length || undefined}
      >
        {qa.length ? (
          <div className="fa-qa">
            {qa.map((x, i) => (
              <div className="fa-exchange" key={i}>
                <div className="fa-exchange-top">
                  <span className="fa-analyst">
                    {x.analyst || "Analyst"}
                    {x.firm && <em>{x.firm}</em>}
                  </span>
                  <span
                    className={`fa-directness ${(x.directness || "").toLowerCase()}`}
                  >
                    {x.directness || "—"}
                  </span>
                </div>

                <p className="fa-q">{x.question}</p>
                <p className="fa-a">
                  {x.answered_by && <strong>{x.answered_by}: </strong>}
                  {x.answer}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="fa-none">
            This transcript has no question and answer section — some calls are
            prepared remarks only.
          </p>
        )}
      </Section>

      <footer className="fa-foot">
        <CalendarBlank size={12} weight="duotone" />
        Analysis is AI-generated from the transcript and can be wrong. Not
        investment advice.
      </footer>
    </div>
  );
}
