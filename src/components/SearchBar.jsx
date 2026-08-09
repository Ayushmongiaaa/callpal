import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Buildings,
  MagnifyingGlass,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { searchCompanies } from "../services/api";
import CompanyLogo from "./CompanyLogo";

/**
 * Search a company by name or ticker and pull its published transcript,
 * instead of having to find the file yourself.
 *
 * The lookup is debounced because the free data tier allows roughly 25
 * requests a day — firing one per keystroke would spend the whole day's quota
 * on the word "nvidia".
 */

export default function SearchBar({ onPick, busy }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  // Two different waits, and they should not look the same. `pending` is the
  // debounce — the app is deliberately doing nothing while you type. `loading`
  // is a request actually in flight.
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);

  const box = useRef(null);
  const input = useRef(null);

  // ⌘K / Ctrl-K focuses the box, as the hint in the corner promises.
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
      }
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onClick(e) {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    }

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const q = query.trim();

    if (q.length < 2) {
      setResults([]);
      setMessage("");
      setLoading(false);
      setPending(false);
      return;
    }

    let cancelled = false;
    setPending(true);

    const timer = setTimeout(async () => {
      // The spinner belongs to the request, not to the debounce. Setting it on
      // every keystroke meant the magnifier flickered into a spinner while you
      // were still typing, which suggests the app is working when it is
      // deliberately waiting for you to stop.
      if (!cancelled) {
        setPending(false);
        setLoading(true);
      }

      try {
        const data = await searchCompanies(q);
        if (cancelled) return;

        if (data.enabled === false) {
          setMessage(
            "Company search needs a free Alpha Vantage key in backend/.env. You can still upload a transcript.",
          );
          setResults([]);
        } else {
          setResults(data.results ?? []);
          setMessage((data.results ?? []).length ? "" : `No companies match "${q}".`);
        }
      } catch (err) {
        if (cancelled) return;
        setResults([]);
        setMessage(
          err?.response?.data?.detail || "Company search is unavailable right now.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function pick(symbol) {
    setOpen(false);
    setQuery("");
    onPick(symbol);
  }

  const showPanel = open && query.trim().length >= 2;

  return (
    <div className="search-wrap" ref={box}>
      <div className="search glass">
        {loading ? (
          <SpinnerGap size={16} color="#a78bfa" weight="bold" className="spin-icon" />
        ) : (
          <MagnifyingGlass size={16} color="#8a82ab" weight="bold" />
        )}

        <input
          ref={input}
          value={query}
          disabled={busy}
          placeholder="Search a company or ticker to pull its earnings call…"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) pick(results[0].symbol);
          }}
        />

        <span className="kbd">⌘K</span>
      </div>

      {showPanel && (
        <div className="search-panel glass">
          {results.map((r) => (
            <button className="search-row" key={r.symbol} onClick={() => pick(r.symbol)}>
              <span className="recent-logo">
                <CompanyLogo ticker={r.symbol} size={16} />
              </span>

              <div className="search-name">
                <strong>{r.name}</strong>
                <span>
                  {r.symbol} · {r.region}
                </span>
              </div>

              <ArrowRight size={12} weight="bold" />
            </button>
          ))}

          {!results.length && (
            <div className="search-note">
              {loading || pending ? (
                <>
                  <SpinnerGap size={13} weight="bold" className="spin-icon" />
                  Searching…
                </>
              ) : (
                <>
                  {message.includes("key") ? (
                    <Warning size={13} weight="fill" />
                  ) : (
                    <Buildings size={13} weight="duotone" />
                  )}
                  {message || "Type at least two characters."}
                </>
              )}
            </div>
          )}

          {results.length > 0 && (
            <div className="search-foot">
              Picks the most recent published call for that ticker
            </div>
          )}
        </div>
      )}
    </div>
  );
}
