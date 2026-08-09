import React from "react";
import { Bell, CaretDown } from "@phosphor-icons/react";
import SearchBar from "./SearchBar";

/**
 * The bell is wired to the Alerts page and carries the real count of risks
 * flagged across the library.
 *
 * There was a theme toggle next to it. It did nothing, and a control that does
 * nothing is worse than no control — so it is gone rather than faked. The app
 * is designed dark; a light theme would be a real piece of work, not a button.
 */

export default function Topbar({ onPickCompany, busy, alertCount = 0, onOpenAlerts }) {
  return (
    <header className="topbar">
      <SearchBar onPick={onPickCompany} busy={busy} />

      <button
        className="icon-btn"
        title={
          alertCount
            ? `${alertCount} risk${alertCount > 1 ? "s" : ""} flagged — open Alerts`
            : "No risks flagged yet"
        }
        onClick={onOpenAlerts}
        type="button"
      >
        <Bell size={17} weight="duotone" />
        {alertCount > 0 && (
          <span className="icon-badge">{alertCount > 9 ? "9+" : alertCount}</span>
        )}
      </button>

      <div className="user">
        <span className="user-initials">AM</span>
        <span>Ayush</span>
        <CaretDown size={11} weight="bold" color="#71717f" />
      </div>
    </header>
  );
}
