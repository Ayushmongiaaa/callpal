import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bell,
  CalendarBlank,
  SpinnerGap,
  TrendDown,
  Warning,
} from "@phosphor-icons/react";
import { notifications as fetchNotifications } from "../services/api";

/**
 * The bell opens a summary rather than navigating away.
 *
 * Jumping straight to the Alerts page meant losing whatever you were reading to
 * find out whether the bell was worth clicking. This shows what is there, and
 * still offers the full page for anyone who wants it.
 *
 * Everything in here is real. Upcoming reporting dates come from the provider's
 * earnings calendar, filtered to companies actually in the library; the rest is
 * drawn from stored analyses. Nothing is invented to fill the panel — when
 * there is nothing to say, it says so.
 */

const PANEL_W = 344;
const EDGE = 12;

const ICONS = {
  upcoming: CalendarBlank,
  guidance: TrendDown,
  risk: Warning,
};

function Panel({ anchor, onClose, onOpenCall, onOpenAlerts }) {
  const card = useRef(null);
  const [pos, setPos] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useLayoutEffect(() => {
    if (!anchor || !card.current) return;

    const a = anchor.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(PANEL_W, vw - EDGE * 2);

    // Hung from the bell's right edge, so it opens inward rather than off the
    // side of the window.
    const left = Math.min(Math.max(EDGE, a.right - width), vw - width - EDGE);

    setPos({ top: a.bottom + 10, left, width });
  }, [anchor, data]);

  useEffect(() => {
    let cancelled = false;

    fetchNotifications()
      .then((d) => !cancelled && setData(d))
      .catch(() => !cancelled && setError("Could not load notifications."));

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (!card.current?.contains(e.target) && !anchor?.contains(e.target)) onClose();
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchor, onClose]);

  const items = data?.items ?? [];
  const upcoming = items.filter((i) => i.kind === "upcoming");
  const rest = items.filter((i) => i.kind !== "upcoming");

  const row = (item, i) => {
    const Icon = ICONS[item.kind] || Warning;

    return (
      <button
        className={`note-row ${item.kind}`}
        key={`${item.kind}-${i}-${item.title}`}
        onClick={() => {
          if (item.call_id) onOpenCall(item.call_id);
          onClose();
        }}
        disabled={!item.call_id}
        type="button"
      >
        <span className="note-icon">
          <Icon size={13} weight="duotone" />
        </span>

        <span className="note-text">
          <strong>{item.title}</strong>
          {item.detail && <span>{item.detail}</span>}
        </span>

        {item.call_id && <ArrowRight size={11} weight="bold" className="note-go" />}
      </button>
    );
  };

  return createPortal(
    // Portalled for the same reason the quote popover is: the topbar sits
    // inside a blurred, stacking-context-forming ancestor, which would trap a
    // fixed-position panel underneath the page content.
    <div
      ref={card}
      className={`note-panel ${pos ? "placed" : ""}`}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
      role="dialog"
      aria-label="Notifications"
    >
      <div className="note-head">
        <span>Notifications</span>
        <button onClick={() => { onOpenAlerts(); onClose(); }} type="button">
          View all
        </button>
      </div>

      {!data && !error && (
        <div className="note-empty">
          <SpinnerGap size={14} weight="bold" className="spin-icon" />
          Checking…
        </div>
      )}

      {error && <div className="note-empty">{error}</div>}

      {data && !items.length && (
        <div className="note-empty">
          Nothing to flag yet. Analyze a call and risks, guidance changes and
          upcoming reporting dates show up here.
        </div>
      )}

      {upcoming.length > 0 && (
        <>
          <div className="note-group">Coming up</div>
          {upcoming.map(row)}
        </>
      )}

      {rest.length > 0 && (
        <>
          {upcoming.length > 0 && <div className="note-group">From your calls</div>}
          {rest.map(row)}
        </>
      )}

      {data && !data.upcoming_available && items.length > 0 && (
        <div className="note-foot">
          Upcoming reporting dates need an Alpha Vantage key, or the daily free
          quota has been used.
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function NotificationBell({ count = 0, onOpenCall, onOpenAlerts }) {
  const [open, setOpen] = useState(false);
  const btn = useRef(null);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={btn}
        className={`icon-btn ${open ? "on" : ""}`}
        title={count ? `${count} thing${count > 1 ? "s" : ""} to look at` : "Notifications"}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        type="button"
      >
        <Bell size={17} weight="duotone" />
        {count > 0 && <span className="icon-badge">{count > 9 ? "9+" : count}</span>}
      </button>

      {open && (
        <Panel
          anchor={btn.current}
          onClose={close}
          onOpenCall={onOpenCall}
          onOpenAlerts={onOpenAlerts}
        />
      )}
    </>
  );
}
