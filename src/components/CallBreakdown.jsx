import React, { useState } from "react";
import {
  CaretDown,
  ChartBar,
  ChatsCircle,
  Megaphone,
  ShieldWarning,
  Target,
} from "@phosphor-icons/react";

/**
 * The call, taken apart the way an earnings call is actually structured.
 *
 * Every one of these runs the same order — safe harbor, the CEO's framing of
 * the quarter, the CFO's numbers, guidance for what is next, then analysts
 * pushing in Q&A. Splitting the transcript along those lines is the difference
 * between a summary and something you could take into a meeting.
 *
 * Nothing here is inferred. Any figure management did not state comes back as
 * an empty string from the model and is simply not rendered — a blank is
 * honest, a computed number would not be.
 */

const SECTIONS = [
  { id: "opening", label: "Opening", icon: Megaphone },
  { id: "financials", label: "Financial review", icon: ChartBar },
  { id: "outlook", label: "Outlook", icon: Target },
  { id: "qa", label: "Q&A", icon: ChatsCircle },
];

const FIGURES = [
  { key: "revenue", label: "Revenue" },
  { key: "revenue_growth", label: "Revenue growth" },
  { key: "net_income", label: "Net income" },
  { key: "eps", label: "Earnings per share" },
  { key: "gross_margin", label: "Gross margin" },
  { key: "operating_margin", label: "Operating margin" },
  { key: "free_cash_flow", label: "Free cash flow" },
  { key: "cash_position", label: "Cash position" },
  { key: "debt", label: "Debt" },
];

const DIRECTNESS = {
  Direct: "direct",
  Partial: "partial",
  Deflected: "deflected",
};

function Empty({ children }) {
  return <p className="bd-empty">{children}</p>;
}

export default function CallBreakdown({ call }) {
  const [open, setOpen] = useState("opening");

  const opening = call.opening ?? {};
  const financials = call.financials ?? {};
  const outlook = call.outlook ?? {};
  const qa = call.qa ?? [];
  const speakers = call.speakers ?? [];

  const stated = FIGURES.filter((f) => financials[f.key]);

  // Nothing to show on the bundled demo, which has no transcript behind it.
  const hasAny =
    opening.ceo_summary ||
    stated.length ||
    outlook.next_quarter ||
    outlook.full_year ||
    qa.length;

  if (!hasAny) return null;

  const counts = {
    opening: (opening.drivers ?? []).length,
    financials: stated.length,
    outlook: (outlook.challenges ?? []).length,
    qa: qa.length,
  };

  return (
    <section className="glass breakdown">
      <div className="panel-head">
        <div>
          <h3 className="panel-title">Inside the call</h3>
          <p className="panel-sub">
            The transcript broken into the four parts every earnings call has
          </p>
        </div>

        {speakers.length > 0 && (
          <div className="bd-speakers" title={speakers.map((s) => `${s.name} — ${s.role}`).join("\n")}>
            {speakers.length} speaker{speakers.length > 1 ? "s" : ""}
          </div>
        )}
      </div>

      <div className="bd-tabs">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`bd-tab ${open === id ? "on" : ""}`}
            onClick={() => setOpen(id)}
            type="button"
          >
            <Icon size={14} weight={open === id ? "fill" : "regular"} />
            {label}
            {counts[id] > 0 && <span className="bd-count num">{counts[id]}</span>}
          </button>
        ))}
      </div>

      {open === "opening" && (
        <div className="bd-body">
          {opening.safe_harbor && (
            <div className="bd-note">
              <ShieldWarning size={13} weight="fill" />
              A forward-looking statements disclaimer was read at the top of this
              call.
            </div>
          )}

          {opening.ceo_summary ? (
            <>
              <h4 className="bd-h">How management framed the quarter</h4>
              <p className="bd-p">{opening.ceo_summary}</p>
            </>
          ) : (
            <Empty>No opening summary was identified in this transcript.</Empty>
          )}

          {(opening.drivers ?? []).length > 0 && (
            <>
              <h4 className="bd-h">What moved the numbers</h4>
              <ul className="bd-list">
                {opening.drivers.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}

          {speakers.length > 0 && (
            <>
              <h4 className="bd-h">On the call</h4>
              <div className="bd-people">
                {speakers.map((s) => (
                  <span className="bd-person" key={s.name + s.role}>
                    <strong>{s.name}</strong>
                    {s.role && <em>{s.role}</em>}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {open === "financials" && (
        <div className="bd-body">
          {stated.length ? (
            <>
              <div className="bd-figures">
                {stated.map((f) => (
                  <div className="bd-figure" key={f.key}>
                    <span className="bd-figure-label">{f.label}</span>
                    <strong className="num">{financials[f.key]}</strong>
                  </div>
                ))}
              </div>

              {stated.length < FIGURES.length && (
                <Empty>
                  {FIGURES.length - stated.length} other figure
                  {FIGURES.length - stated.length > 1 ? "s were" : " was"} not
                  stated on this call. CallPal only shows numbers management
                  actually said.
                </Empty>
              )}
            </>
          ) : (
            <Empty>
              No financial figures were stated in a form CallPal could extract.
            </Empty>
          )}
        </div>
      )}

      {open === "outlook" && (
        <div className="bd-body">
          {outlook.next_quarter && (
            <>
              <h4 className="bd-h">Next quarter</h4>
              <p className="bd-p">{outlook.next_quarter}</p>
            </>
          )}

          {outlook.full_year && (
            <>
              <h4 className="bd-h">Full year</h4>
              <p className="bd-p">{outlook.full_year}</p>
            </>
          )}

          {!outlook.next_quarter && !outlook.full_year && (
            <Empty>Management did not give forward guidance on this call.</Empty>
          )}

          {(outlook.challenges ?? []).length > 0 && (
            <>
              <h4 className="bd-h">Challenges management raised</h4>
              <ul className="bd-list warn">
                {outlook.challenges.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {open === "qa" && (
        <div className="bd-body">
          {qa.length ? (
            <>
              <p className="bd-p bd-lead">
                Unscripted answers are where tone shows. Each exchange is marked
                by whether it actually addressed the question.
              </p>

              <div className="bd-qa">
                {qa.map((x, i) => (
                  <details className="bd-exchange" key={i}>
                    <summary>
                      <span className="bd-analyst">
                        {x.analyst || "Analyst"}
                        {x.firm && <em>{x.firm}</em>}
                      </span>
                      <span className={`bd-directness ${DIRECTNESS[x.directness] || ""}`}>
                        {x.directness || "—"}
                      </span>
                      <CaretDown size={12} weight="bold" className="bd-caret" />
                    </summary>

                    <p className="bd-q">{x.question}</p>
                    <p className="bd-a">
                      {x.answered_by && <strong>{x.answered_by}: </strong>}
                      {x.answer}
                    </p>
                  </details>
                ))}
              </div>
            </>
          ) : (
            <Empty>
              This transcript has no question and answer section — some calls are
              prepared remarks only.
            </Empty>
          )}
        </div>
      )}
    </section>
  );
}
