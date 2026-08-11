/**
 * The CallPal report: a designed document, not a printed web page.
 *
 * The earlier version was a styled memo — headings and paragraphs down a single
 * column. This is built the way a real report is: a full-bleed cover, a table
 * of contents with real page numbers, numbered sections, a section tab down the
 * edge of every page so you always know where you are, pull-quotes, and
 * figure callouts.
 *
 * Structure, and why:
 *
 *   - Contents is written LAST, into a page reserved at the start. Page numbers
 *     cannot be known until the content has been laid out, and guessing them is
 *     how contents pages end up wrong.
 *   - Section tabs are also drawn at the end, once we know which pages belong
 *     to which section.
 *   - Charts are vectors, so they stay sharp at any zoom and add almost nothing
 *     to the file size.
 *   - jsPDF is imported on demand. Nobody who never clicks Download should pay
 *     350KB for it on first paint.
 *
 * Every value comes from the stored analysis. Figures management did not state
 * print as "Not stated" rather than being guessed at.
 */

const A4 = { w: 210, h: 297 };

// The right margin is wide because the section tab lives out there.
const M = { l: 20, r: 30, t: 30, b: 24 };
const W = A4.w - M.l - M.r;

const TAB_X = A4.w - 21;
const TAB_W = 6;

const INK = [22, 18, 35];
const BODY = [64, 58, 86];
const MUTED = [128, 120, 150];
const FAINT = [172, 165, 192];
const VIOLET = [124, 92, 240];
const VIOLET_LIGHT = [167, 139, 250];
const VIOLET_PALE = [237, 233, 254];
const VIOLET_WASH = [249, 247, 255];
const PURPLE_DEEP = [46, 16, 101];
const NEAR_BLACK = [12, 10, 18];
const GREEN = [13, 138, 99];
const RED = [199, 58, 58];
const RULE = [228, 223, 245];

function clean(value) {
  const s = (value ?? "").toString().trim();
  return s && !/^(not given|not stated|n\/?a|none|unknown)$/i.test(s) ? s : "";
}

/**
 * A linear gradient, drawn as thin slices. Dependable in every viewer.
 *
 * The slice count is capped rather than fixed at a slice every 0.4mm. A
 * full-page gradient at that resolution is ~740 rectangles, and with one on the
 * cover plus a tab on every page the file passed a megabyte. 140 slices is
 * indistinguishable to the eye over any distance and an order of magnitude
 * cheaper — small gradients still get 0.4mm, so short ramps stay smooth.
 */
function gradient(doc, x, y, w, h, stops, vertical = false) {
  const span = vertical ? h : w;
  const n = Math.max(1, Math.min(140, Math.ceil(span / 0.4)));

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1 || 1);
    const seg = Math.min(Math.floor(t * (stops.length - 1)), stops.length - 2);
    const local = t * (stops.length - 1) - seg;
    const a = stops[seg];
    const b = stops[seg + 1];

    doc.setFillColor(
      Math.round(a[0] + (b[0] - a[0]) * local),
      Math.round(a[1] + (b[1] - a[1]) * local),
      Math.round(a[2] + (b[2] - a[2]) * local),
    );

    if (vertical) doc.rect(x, y + i * (span / n), w, span / n + 0.15, "F");
    else doc.rect(x + i * (span / n), y, span / n + 0.15, h, "F");
  }
}

/** The CallPal mark, in vectors so it never goes soft or fails to load. */
function mark(doc, x, y, size, onDark = false) {
  const r = size * 0.28;

  if (onDark) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, size, size, r, r, "F");
  } else {
    gradient(doc, x, y, size, size, [VIOLET_LIGHT, VIOLET, PURPLE_DEEP], true);
  }

  const bars = [0.38, 0.62, 1, 0.72, 0.46];
  const bw = size * 0.075;
  const gap = size * 0.055;
  let bx = x + (size - (bars.length * bw + (bars.length - 1) * gap)) / 2;

  doc.setFillColor(...(onDark ? VIOLET : [255, 255, 255]));
  for (const b of bars) {
    const bh = size * 0.52 * b;
    doc.roundedRect(bx, y + size / 2 - bh / 2, bw, bh, bw / 2, bw / 2, "F");
    bx += bw + gap;
  }
}

export async function downloadPdf(call, prices) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  let y = M.t;
  let section = null;

  // Where each section begins, filled as we go and used for both the contents
  // page and the edge tabs.
  const toc = [];
  const pageSection = {};

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  // Set the font, then wrap — always in that order. splitTextToSize measures
  // against whatever font is active, so separating the two silently wraps to
  // the wrong width and the text overruns its box.
  const wrap = (str, width, { style = "normal", size = 9.5 } = {}) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    return doc.splitTextToSize(String(str ?? ""), width);
  };

  const newPage = () => {
    doc.addPage();
    y = M.t;
    pageSection[doc.getCurrentPageInfo().pageNumber] = section;
  };

  const room = (needed) => {
    if (y + needed <= A4.h - M.b) return;
    newPage();
  };

  const text = (str, opts = {}) => {
    const {
      size = 9.5,
      color = BODY,
      style = "normal",
      lead = 4.8,
      gap = 0,
      x = M.l,
      maxWidth = W,
    } = opts;

    const lines = wrap(str, maxWidth, { style, size });
    doc.setTextColor(...color);

    for (const line of lines) {
      room(lead);
      doc.text(line, x, y);
      y += lead;
    }
    y += gap;
  };

  /** A numbered section opener. Always starts a fresh page. */
  const openSection = (title, blurb) => {
    if (doc.getCurrentPageInfo().pageNumber > 1 || y > M.t) newPage();

    section = { n: String(toc.length + 1).padStart(2, "0"), title };
    toc.push({ ...section, page: doc.getCurrentPageInfo().pageNumber });
    pageSection[doc.getCurrentPageInfo().pageNumber] = section;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(...VIOLET_PALE);
    doc.text(section.n, M.l, y + 4);

    doc.setFontSize(15);
    doc.setTextColor(...INK);
    const t = wrap(title, W - 22, { style: "bold", size: 15 });
    t.forEach((line, i) => doc.text(line, M.l + 20, y + i * 6.6));

    y += Math.max(10, t.length * 6.6 + 3);

    if (blurb) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      const b = wrap(blurb, W - 20, { size: 8.5 });
      b.forEach((line, i) => doc.text(line, M.l + 20, y + i * 4.4));
      y += b.length * 4.4;
    }

    y += 3;
    gradient(doc, M.l, y, W, 0.7, [VIOLET, VIOLET_PALE]);
    y += 9;
  };

  const subhead = (str) => {
    room(12);
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...PURPLE_DEEP);
    doc.text(str, M.l, y);
    y += 5.5;
  };

  const label = (str) => {
    room(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...VIOLET);
    doc.text(str.toUpperCase(), M.l, y);
    y += 4.6;
  };

  const bullets = (items, color = VIOLET) => {
    for (const item of items) {
      const lines = wrap(item, W - 6, { size: 9.5 });
      room(lines.length * 4.8 + 1);
      doc.setFillColor(...color);
      doc.circle(M.l + 1.2, y - 1.3, 0.75, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...BODY);
      lines.forEach((line, i) => doc.text(line, M.l + 6, y + i * 4.8));
      y += lines.length * 4.8 + 1.6;
    }
    y += 2;
  };

  /**
   * Body text in two columns when it fits on the page, one when it does not.
   *
   * Two columns is what makes these read as a report rather than a printout,
   * but flowing a column break across a page is where that kind of layout goes
   * wrong. So it is only used when the whole block fits where it stands.
   */
  const prose = (str) => {
    const colW = (W - 8) / 2;
    const lines = wrap(str, colW, { size: 9.5 });
    const half = Math.ceil(lines.length / 2);
    const height = half * 4.8;

    if (lines.length < 6 || y + height > A4.h - M.b) {
      text(str, { gap: 2 });
      return;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...BODY);

    lines.slice(0, half).forEach((line, i) => doc.text(line, M.l, y + i * 4.8));
    lines
      .slice(half)
      .forEach((line, i) => doc.text(line, M.l + colW + 8, y + i * 4.8));

    y += height + 3;
  };

  /* ------------------------------------------------------------------ */
  /* cover                                                               */
  /* ------------------------------------------------------------------ */

  gradient(doc, 0, 0, A4.w, A4.h, [NEAR_BLACK, [26, 16, 54], PURPLE_DEEP]);

  // A waveform motif built from stacked sine curves — the same idea as the
  // mark, at page scale. Vectors, so it costs almost nothing.
  // Drawn as polylines rather than per-segment `line` calls: one path object
  // instead of ~70, which is most of the difference between a 1MB file and a
  // 90KB one.
  doc.setLineWidth(0.3);
  for (let row = 0; row < 18; row++) {
    const t = row / 17;
    doc.setDrawColor(
      Math.round(78 + 89 * t),
      Math.round(48 + 91 * t),
      Math.round(158 + 92 * t),
    );

    const pts = [];
    for (let x = -6; x <= A4.w + 6; x += 6) {
      const amp = 13 * (1 - t * 0.45);
      const yy =
        152 + row * 6.2 + Math.sin(x / 34 + row * 0.5) * amp * (0.35 + t * 0.7);
      pts.push([x, yy]);
    }

    doc.lines(
      pts.slice(1).map(([px, py], i) => [px - pts[i][0], py - pts[i][1]]),
      pts[0][0],
      pts[0][1],
    );
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...FAINT);
  doc.text(call.quarter || "Earnings call", M.l, 26);
  doc.text("CallPal · Earnings call analysis", A4.w - M.l, 26, { align: "right" });

  doc.setDrawColor(90, 70, 140);
  doc.setLineWidth(0.2);
  doc.line(M.l, 30, A4.w - M.l, 30);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(40);
  doc.setTextColor(255, 255, 255);
  const coverTitle = wrap(call.company || "Earnings call", A4.w - M.l * 2, {
    style: "bold",
    size: 40,
  });
  coverTitle.slice(0, 3).forEach((line, i) => doc.text(line, M.l, 62 + i * 15));

  let coverY = 62 + Math.min(coverTitle.length, 3) * 15 + 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(...VIOLET_LIGHT);
  doc.text("Earnings Call Analysis", M.l, coverY);
  coverY += 9;

  doc.setFontSize(9);
  doc.setTextColor(...FAINT);
  doc.text(
    [call.ticker, call.date].filter(Boolean).join("   ·   "),
    M.l,
    coverY,
  );

  // Headline figures, on the cover, where a report puts its findings.
  const coverStats = [
    [String(call.sentiment ?? "—"), "Tone /100"],
    [call.guidance || "—", "Guidance"],
    [String(call.riskFlags ?? 0), "Risks flagged"],
  ];

  coverStats.forEach(([v, k], i) => {
    const x = M.l + i * 52;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text(wrap(v, 48, { style: "bold", size: 22 })[0], x, 128);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...VIOLET_LIGHT);
    doc.text(k.toUpperCase(), x, 134);
  });

  // Footer strip.
  gradient(doc, 0, A4.h - 26, A4.w, 26, [VIOLET, PURPLE_DEEP]);
  mark(doc, M.l, A4.h - 19, 12, true);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text("CallPal", M.l + 16, A4.h - 12.5);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...VIOLET_PALE);
  doc.text("By Ayush Mongia", M.l + 16, A4.h - 8.5);
  doc.text("callpal-liard.vercel.app", A4.w - M.l, A4.h - 10.5, { align: "right" });

  /* ------------------------------------------------------------------ */
  /* contents — reserved now, written at the end                         */
  /* ------------------------------------------------------------------ */

  doc.addPage();
  const TOC_PAGE = doc.getCurrentPageInfo().pageNumber;

  /* ------------------------------------------------------------------ */
  /* 01 — overview                                                       */
  /* ------------------------------------------------------------------ */

  openSection("Overview", "What the call amounted to, in one page.");

  if (call.summary) {
    const lines = wrap(call.summary, W - 14, { size: 11 });
    const h = lines.length * 5.6 + 11;

    doc.setFillColor(...VIOLET_WASH);
    doc.roundedRect(M.l, y - 6, W, h, 2, 2, "F");
    gradient(doc, M.l, y - 6, 1.2, h, [VIOLET_LIGHT, PURPLE_DEEP], true);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    lines.forEach((line, i) => doc.text(line, M.l + 8, y + i * 5.6));

    y += h + 2;
  }

  const stats = [
    ["Management tone", `${call.sentiment ?? "—"}/100`, call.sentimentLabel || ""],
    ["Guidance", call.guidance || "Not stated", "vs. prior quarter"],
    ["Revenue outlook", clean(call.revenueOutlook) || "Not stated", "management guidance"],
    ["Risks flagged", String(call.riskFlags ?? 0), `${call.riskLevel || "None"} concern`],
  ];

  room(30);
  const cw = W / 2;
  stats.forEach(([k, v, note], i) => {
    const x = M.l + (i % 2) * cw;
    const yy = y + Math.floor(i / 2) * 24;

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.3);
    doc.line(x, yy, x + cw - 6, yy);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...VIOLET);
    doc.text(k.toUpperCase(), x, yy + 5);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...INK);
    doc.text(wrap(v, cw - 8, { style: "bold", size: 15 })[0], x, yy + 13);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(wrap(note, cw - 8, { size: 7 })[0] || "", x, yy + 18);
  });
  y += 52;

  /* ------------------------------------------------------------------ */
  /* 02 — the arc of the call                                            */
  /* ------------------------------------------------------------------ */

  const tone = (call.timeline ?? []).filter((s) => typeof s.score === "number");
  const series = prices?.series ?? [];

  if (tone.length > 1 || series.length > 2) {
    openSection(
      "The arc of the call",
      "Management's tone section by section, and what the market did with it.",
    );

    if (tone.length > 1) {
      subhead("Tone through the call");

      const H = 44;
      room(H + 14);

      const y0 = y;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);

      [0, 25, 50, 75, 100].forEach((v) => {
        const gy = y0 + H - (v / 100) * H;
        doc.line(M.l, gy, M.l + W, gy);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6);
        doc.setTextColor(...FAINT);
        doc.text(String(v), M.l - 5, gy + 1);
      });

      const pt = (i, score) => [
        M.l + (i / (tone.length - 1)) * W,
        y0 + H - (Math.max(0, Math.min(100, score)) / 100) * H,
      ];

      // Fill under the curve, so it reads as a chart rather than a line.
      doc.setFillColor(...VIOLET_PALE);
      for (let i = 1; i < tone.length; i++) {
        const [ax, ay] = pt(i - 1, tone[i - 1].score);
        const [bx, by] = pt(i, tone[i].score);
        doc.triangle(ax, ay, bx, by, ax, y0 + H, "F");
        doc.triangle(bx, by, bx, y0 + H, ax, y0 + H, "F");
      }

      doc.setDrawColor(...VIOLET);
      doc.setLineWidth(0.8);
      for (let i = 1; i < tone.length; i++) {
        const [ax, ay] = pt(i - 1, tone[i - 1].score);
        const [bx, by] = pt(i, tone[i].score);
        doc.line(ax, ay, bx, by);
      }

      tone.forEach((s, i) => {
        const [px, py] = pt(i, s.score);
        doc.setFillColor(...(s.score >= 50 ? VIOLET : RED));
        doc.circle(px, py, 0.9, "F");
      });

      const qaAt = tone.findIndex((s) => (s.section || "").startsWith("Q&A"));
      if (qaAt > 0) {
        const [qx] = pt(qaAt, 0);
        doc.setDrawColor(...MUTED);
        doc.setLineWidth(0.3);
        doc.setLineDashPattern([1.2, 1.2], 0);
        doc.line(qx, y0, qx, y0 + H);
        doc.setLineDashPattern([], 0);

        doc.setFillColor(...VIOLET);
        doc.roundedRect(qx + 1, y0 - 1, 17, 4.6, 1, 1, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.6);
        doc.setTextColor(255, 255, 255);
        doc.text("Q&A BEGINS", qx + 2.6, y0 + 2.1);
      }

      y += H + 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(...MUTED);
      doc.text(
        `Scored across ${tone.length} sections of the transcript. 50 is neutral.`,
        M.l,
        y,
      );
      y += 8;
    }

    if (series.length > 2) {
      subhead("What the share price did");

      const H = 38;
      room(H + 14);

      const closes = series.map((d) => d.close).filter((n) => typeof n === "number");
      const lo = Math.min(...closes);
      const hi = Math.max(...closes);
      const span = hi - lo || 1;
      const y0 = y;
      const up = closes[closes.length - 1] >= closes[0];
      const line = up ? GREEN : RED;

      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(M.l, y0 + H, M.l + W, y0 + H);

      doc.setDrawColor(...line);
      doc.setLineWidth(0.7);
      for (let i = 1; i < closes.length; i++) {
        const ax = M.l + ((i - 1) / (closes.length - 1)) * W;
        const bx = M.l + (i / (closes.length - 1)) * W;
        doc.line(
          ax,
          y0 + H - ((closes[i - 1] - lo) / span) * H,
          bx,
          y0 + H - ((closes[i] - lo) / span) * H,
        );
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(`$${hi.toFixed(2)}`, M.l + W + 2, y0 + 2);
      doc.text(`$${lo.toFixed(2)}`, M.l + W + 2, y0 + H);

      y += H + 5;
      doc.setFontSize(7);
      doc.text(
        `${series.length} daily closes around the call${
          prices?.reaction != null
            ? ` · ${prices.reaction > 0 ? "+" : ""}${prices.reaction.toFixed(2)}% the next session`
            : ""
        }`,
        M.l,
        y,
      );
      y += 6;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 03 — the room                                                       */
  /* ------------------------------------------------------------------ */

  const speakers = call.speakers ?? [];
  const opening = call.opening ?? {};

  if (speakers.length || clean(opening.ceo_summary) || (opening.drivers ?? []).length) {
    openSection(
      "The room",
      "Who spoke, and how management chose to frame the quarter before anyone asked.",
    );

    if (speakers.length) {
      label("On the call");
      speakers.forEach((s) => {
        room(10);
        doc.setFillColor(...VIOLET_WASH);
        doc.roundedRect(M.l, y - 4, W, 9, 1.5, 1.5, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        doc.text(s.name || "", M.l + 4, y + 1.6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        doc.text(s.role || "", M.l + W - 4, y + 1.6, { align: "right" });
        y += 11;
      });
      y += 2;
    }

    if (opening.safe_harbor) {
      room(10);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(
        "Safe-harbour statement present — forward-looking remarks were formally qualified.",
        M.l,
        y,
      );
      y += 7;
    }

    if (clean(opening.ceo_summary)) {
      subhead("How the quarter was framed");
      prose(opening.ceo_summary);
    }

    if ((opening.drivers ?? []).length) {
      label("What moved the numbers");
      bullets(opening.drivers);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 04 — the numbers                                                    */
  /* ------------------------------------------------------------------ */

  const fin = call.financials ?? {};
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
  const missing = figures.filter(([, v]) => !clean(v)).length;

  openSection(
    "The numbers",
    missing
      ? `${missing} of the ${figures.length} headline figures were never stated on this call.`
      : "Every headline figure below was stated by management on the call.",
  );

  const rowH = 8.4;
  figures.forEach(([k, v], i) => {
    room(rowH);
    const value = clean(v);

    if (i % 2 === 0) {
      doc.setFillColor(...VIOLET_WASH);
      doc.rect(M.l, y - 5.4, W, rowH, "F");
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...(value ? BODY : FAINT));
    doc.text(k, M.l + 3, y);

    doc.setFont("helvetica", value ? "bold" : "italic");
    doc.setFontSize(value ? 10 : 8.5);
    doc.setTextColor(...(value ? INK : FAINT));
    doc.text(value || "Not stated", M.l + W - 3, y, { align: "right" });

    y += rowH;
  });

  y += 3;
  text("Blanks are the call's, not estimates. Nothing here is inferred or recalled.", {
    size: 7.5,
    color: MUTED,
    lead: 4,
  });

  const outlook = call.outlook ?? {};
  if (clean(outlook.next_quarter) || clean(outlook.full_year) || (outlook.challenges ?? []).length) {
    subhead("What they said comes next");

    [["Next quarter", outlook.next_quarter], ["Full year", outlook.full_year]].forEach(
      ([k, v]) => {
        if (!clean(v)) return;
        label(k);
        text(v, { gap: 1 });
      },
    );

    if ((outlook.challenges ?? []).length) {
      label("Challenges management named");
      bullets(outlook.challenges, RED);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 05 — the case each way                                              */
  /* ------------------------------------------------------------------ */

  const bull = call.evidence?.bullish ?? [];
  const bear = call.evidence?.bearish ?? [];

  if (bull.length || bear.length) {
    openSection(
      "The case each way",
      "Every point carries the words it came from, so nothing has to be taken on trust.",
    );

    const withQuotes = (points, tint, title) => {
      if (!points.length) return;
      subhead(title);

      for (const p of points) {
        const head = wrap(p.text, W - 8, { style: "bold", size: 9.5 });
        const quote = p.source?.excerpt
          ? wrap(`“${p.source.excerpt}”`, W - 14, { style: "italic", size: 8.5 })
          : [];

        room(head.length * 4.8 + quote.length * 4.4 + 12);

        const top = y - 4;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        head.forEach((line, i) => doc.text(line, M.l + 7, y + i * 4.8));
        y += head.length * 4.8 + 1;

        if (quote.length) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(8.5);
          doc.setTextColor(...BODY);
          quote.forEach((line, i) => doc.text(line, M.l + 7, y + i * 4.4));
          y += quote.length * 4.4 + 1;

          doc.setFont("helvetica", "bold");
          doc.setFontSize(6.2);
          doc.setTextColor(...MUTED);
          doc.text(
            [p.source.speaker, p.source.section].filter(Boolean).join("  ·  ").toUpperCase(),
            M.l + 7,
            y + 1.5,
          );
          y += 4;
        }

        gradient(doc, M.l, top, 1.4, y - top - 1, [tint, [255, 255, 255]], true);
        y += 6;
      }
    };

    withQuotes(bull, GREEN, "The bull case");
    withQuotes(bear, RED, "The bear case");
  }

  /* ------------------------------------------------------------------ */
  /* 06 — risks                                                          */
  /* ------------------------------------------------------------------ */

  if ((call.riskList ?? []).length) {
    openSection(
      "Risks flagged",
      "Drawn from the call itself, not from outside coverage.",
    );
    bullets(call.riskList, RED);
  }

  /* ------------------------------------------------------------------ */
  /* 07 — the Q&A                                                        */
  /* ------------------------------------------------------------------ */

  const qa = call.qa ?? [];
  if (qa.length) {
    openSection(
      "The Q&A in full",
      "Each exchange marked by whether the answer actually addressed the question.",
    );

    qa.forEach((x) => {
      const q = wrap(x.question, W - 8, { style: "bold", size: 9 });
      const a = wrap(
        `${x.answered_by ? `${x.answered_by}: ` : ""}${x.answer || ""}`,
        W - 8,
        { size: 9 },
      );

      room(q.length * 4.6 + a.length * 4.6 + 16);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.8);
      doc.setTextColor(...VIOLET);
      doc.text(
        [x.analyst || "Analyst", x.firm].filter(Boolean).join("  ·  ").toUpperCase(),
        M.l,
        y,
      );

      if (x.directness) {
        const d = x.directness.toUpperCase();
        doc.setFont("helvetica", "bold");
        doc.setFontSize(5.8);
        const dw = doc.getTextWidth(d) + 5;
        const tint = /direct/i.test(x.directness)
          ? GREEN
          : /deflect/i.test(x.directness)
            ? RED
            : MUTED;
        doc.setFillColor(...tint);
        doc.roundedRect(M.l + W - dw, y - 3.4, dw, 5, 2.5, 2.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(d, M.l + W - dw + 2.5, y);
      }

      y += 5.5;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      q.forEach((line, i) => doc.text(line, M.l, y + i * 4.6));
      y += q.length * 4.6 + 1.5;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BODY);
      a.forEach((line, i) => doc.text(line, M.l, y + i * 4.6));
      y += a.length * 4.6 + 6;

      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.2);
      doc.line(M.l, y - 3, M.l + W, y - 3);
    });
  }

  /* ------------------------------------------------------------------ */
  /* contents, written back into the reserved page                       */
  /* ------------------------------------------------------------------ */

  const pages = doc.getNumberOfPages();
  doc.setPage(TOC_PAGE);

  let ty = M.t + 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...INK);
  doc.text("Contents", M.l, ty);
  ty += 4;
  gradient(doc, M.l, ty, 26, 0.8, [VIOLET, VIOLET_PALE]);
  ty += 16;

  toc.forEach((s) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...VIOLET_LIGHT);
    doc.text(s.n, M.l, ty);

    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(s.title, M.l + 12, ty);

    // Leader dots, so the eye can travel to the page number.
    const from = M.l + 12 + doc.getTextWidth(s.title) + 3;
    const to = M.l + W - 8;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.setLineDashPattern([0.4, 1.4], 0);
    if (to > from) doc.line(from, ty - 1, to, ty - 1);
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...VIOLET);
    doc.text(String(s.page), M.l + W, ty, { align: "right" });

    ty += 11;
  });

  ty += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const note = wrap(
    "Every figure and quotation in this report is taken from the transcript of the call. Where management did not state a figure, it is marked \"Not stated\" rather than estimated.",
    W,
    { size: 8 },
  );
  note.forEach((line, i) => doc.text(line, M.l, ty + i * 4.4));

  /* ------------------------------------------------------------------ */
  /* page furniture                                                      */
  /* ------------------------------------------------------------------ */

  for (let p = 2; p <= pages; p++) {
    doc.setPage(p);

    // Header
    mark(doc, M.l, 14, 6.4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(...PURPLE_DEEP);
    doc.text("CallPal", M.l + 8.6, 18.6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      [call.company, call.quarter].filter(Boolean).join("  ·  "),
      A4.w - M.l,
      18.6,
      { align: "right" },
    );

    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.25);
    doc.line(M.l, 22.5, A4.w - M.l, 22.5);

    // The section tab down the right edge — the thing that makes a long
    // document navigable without a scrollbar.
    const s = pageSection[p];
    if (s) {
      const tabH = 54;
      const tabY = 60;
      gradient(doc, TAB_X, tabY, TAB_W, tabH, [VIOLET, PURPLE_DEEP], true);

      doc.saveGraphicsState();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(s.title.toUpperCase(), TAB_X + 4.4, tabY + tabH - 4, {
        angle: 90,
        maxWidth: tabH - 8,
      });
      doc.restoreGraphicsState();

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...VIOLET_LIGHT);
      doc.text(s.n, TAB_X + 1.1, tabY - 3);
    }

    // Footer
    gradient(doc, M.l, A4.h - 15, W, 0.5, [VIOLET_LIGHT, [255, 255, 255]]);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(
      "AI-generated from the transcript and may be wrong. Not investment advice.",
      M.l,
      A4.h - 10,
    );

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...VIOLET);
    doc.text(String(p), A4.w - M.l, A4.h - 10, { align: "right" });
  }

  const stamp = (call.date || new Date().toISOString().slice(0, 10)).replace(/\//g, "-");
  const name = `CallPal-${(call.ticker || call.company || "call")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${stamp}.pdf`;

  doc.save(name);
  return name;
}
