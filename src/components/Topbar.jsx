import React from "react";
import { CaretDown } from "@phosphor-icons/react";
import SearchBar from "./SearchBar";
import NotificationBell from "./NotificationBell";

/**
 * The bell opens a summary of what is waiting rather than navigating to the
 * Alerts page — you should be able to see whether it is worth looking at
 * without losing the call you are reading.
 *
 * There was a theme toggle next to it. It did nothing, and a control that does
 * nothing is worse than no control — so it is gone rather than faked. The app
 * is designed dark; a light theme would be a real piece of work, not a button.
 */

export default function Topbar({
  onPickCompany,
  busy,
  alertCount = 0,
  onOpenAlerts,
  onOpenCall,
}) {
  return (
    <header className="topbar">
      <SearchBar onPick={onPickCompany} busy={busy} />

      <NotificationBell
        count={alertCount}
        onOpenAlerts={onOpenAlerts}
        onOpenCall={onOpenCall}
      />

      <div className="user">
        <span className="user-initials">AM</span>
        <span>Ayush</span>
        <CaretDown size={11} weight="bold" color="#71717f" />
      </div>
    </header>
  );
}
