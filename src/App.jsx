import React, { useState } from "react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import CallAssistant from "./components/CallAssistant";
import RecentCalls from "./components/RecentCalls";
import Dashboard from "./pages/Dashboard";
import FullAnalysis from "./pages/FullAnalysis";
import {
  AlertsPage,
  CalendarPage,
  CallsPage,
  ComparePage,
  InsightsPage,
  TrendsPage,
  WatchlistPage,
} from "./pages/Pages";
import Walkthrough from "./components/Walkthrough";
import SampleFile from "./components/SampleFile";
import useCallPal from "./hooks/useCallPal";
import useBackend from "./hooks/useBackend";
import BackendBanner from "./components/BackendBanner";

export default function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const {
    call,
    prices,
    recent,
    library,
    libraryLoaded,
    status,
    error,
    messages,
    asking,
    analyze,
    analyzeTicker,
    ask,
    reset,
    openCall,
    removeCall,
  } = useCallPal();

  // Watches the API and clears itself when it comes back, so a backend that
  // died while the tab was open no longer needs a manual reload.
  const { online, waking, checking, retry } = useBackend();

  // Opening a stored call always drops you back on the dashboard, which is
  // the only page that renders a full analysis.
  const open = (id) => {
    openCall(id);
    setActivePage("Dashboard");
  };

  // Only the page being shown is built. Constructing all eight on every render
  // meant every keystroke in the chat box also rebuilt seven charts nobody was
  // looking at, which is what made switching pages feel sluggish.
  function renderPage() {
    switch (activePage) {
      case "Calls":
        return <CallsPage loaded={libraryLoaded} library={library} onOpen={open} onDelete={removeCall} />;
      case "Watchlist":
        return <WatchlistPage loaded={libraryLoaded} library={library} onOpen={open} />;
      case "Calendar":
        return <CalendarPage loaded={libraryLoaded} library={library} onOpen={open} />;
      case "Insights":
        return <InsightsPage loaded={libraryLoaded} library={library} />;
      case "Trends":
        return <TrendsPage loaded={libraryLoaded} library={library} />;
      case "Alerts":
        return <AlertsPage loaded={libraryLoaded} library={library} onOpen={open} />;
      case "Compare":
        return <ComparePage loaded={libraryLoaded} library={library} onOpen={open} />;
      case "Analysis":
        return <FullAnalysis call={call} onBack={() => setActivePage("Dashboard")} />;
      default:
        return (
          <Dashboard
            call={call}
            prices={prices}
            status={status}
            error={error}
            onFile={analyze}
            onReset={reset}
            onViewFull={() => setActivePage("Analysis")}
          />
        );
    }
  }

  // The stored library is the truth once anything has been analyzed; the
  // bundled demo list only fills the rail on a first visit.
  //
  // Re-analyzing the same call is normal while testing, so the rail shows one
  // row per company and quarter — four identical Tesla rows reads as a bug.
  const railCalls = library.length
    ? Object.values(
        library.reduce((seen, c) => {
          const key = `${c.ticker || c.company}|${c.quarter}`;
          if (!seen[key]) {
            seen[key] = {
              company: c.company,
              ticker: c.ticker,
              website: c.website,
              quarter: c.quarter,
              date: c.call_date || "Date not stated",
              id: c.id,
            };
          }
          return seen;
        }, {}),
      ).slice(0, 6)
    : recent;

  return (
    <>
      <div className="app-bg" />
      <Walkthrough />
      <SampleFile />

      <div className="app-shell">
        <Sidebar activePage={activePage} onChange={setActivePage} />

        <main className="main">
          <BackendBanner
            online={online}
            waking={waking}
            checking={checking}
            onRetry={retry}
          />

          <Topbar
            onPickCompany={(symbol) => {
              setActivePage("Dashboard");
              analyzeTicker(symbol);
            }}
            busy={status === "fetching" || status === "analyzing"}
            alertCount={library.reduce((n, c) => n + (c.risk_count ?? 0), 0)}
            onOpenAlerts={() => setActivePage("Alerts")}
            onOpenCall={open}
          />
          {/* Keyed on the page name so React swaps the subtree cleanly and the
              entrance animation replays on each switch. */}
          <div className="page" key={activePage}>
            {renderPage()}
          </div>
        </main>

        <aside className="rail">
          <CallAssistant
            call={call}
            messages={messages}
            asking={asking}
            onAsk={ask}
          />
          <RecentCalls
            calls={railCalls}
            onOpen={open}
            onViewAll={() => setActivePage("Calls")}
          />
        </aside>
      </div>
    </>
  );
}
