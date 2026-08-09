import React from "react";
import {
  ArrowsLeftRight,
  Bell,
  CalendarBlank,
  House,
  Lightbulb,
  PhoneCall,
  Star,
  TrendUp,
} from "@phosphor-icons/react";
import BrandMark from "./BrandMark";

const items = [
  { label: "Dashboard", icon: House },
  { label: "Calls", icon: PhoneCall },
  { label: "Watchlist", icon: Star },
  { label: "Calendar", icon: CalendarBlank },
  { label: "Insights", icon: Lightbulb },
  { label: "Trends", icon: TrendUp },
  { label: "Alerts", icon: Bell },
  { label: "Compare", icon: ArrowsLeftRight },
];

export default function Sidebar({ activePage, onChange }) {
  return (
    <aside className="sidebar glass">
      <div className="brand">
        <div className="brand-mark">
          <BrandMark size={19} />
        </div>
        <div className="brand-text">
          <span className="brand-name">CallPal</span>
          <span className="brand-by">By Ayush Mongia</span>
        </div>
      </div>

      <nav className="nav">
        {items.map(({ label, icon: Icon }) => (
          <button
            key={label}
            className={`nav-item ${activePage === label ? "active" : ""}`}
            onClick={() => onChange(label)}
          >
            <Icon size={17} weight={activePage === label ? "fill" : "regular"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar-foot">
        <span>Earnings call intelligence</span>
      </div>
    </aside>
  );
}
