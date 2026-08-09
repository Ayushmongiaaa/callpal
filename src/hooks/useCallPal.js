import { useCallback, useEffect, useState } from "react";
import {
  analyzeSymbol,
  analyzeTranscript,
  askCallPal,
  deleteCall,
  fetchPrices,
  getCall,
  listCalls,
} from "../services/api";
import {
  featuredCall as demoCall,
  recentCalls as demoRecent,
  takeaways as demoTakeaways,
} from "../data/mockData";

/**
 * All CallPal state in one place: the active call, its market data, the chat
 * thread, and the upload lifecycle.
 *
 * Until something is uploaded the dashboard shows the bundled NVIDIA demo so it
 * never looks empty. The moment an analysis succeeds, `call` is rebuilt from the
 * API response and every component re-renders from real data.
 */

const DEMO_DATE = "2024-05-22";

function toCall(analysis) {
  const bull = analysis.bullish_points ?? [];
  const bear = analysis.bearish_points ?? [];

  return {
    isDemo: false,
    callId: analysis.call_id,
    company: analysis.company || "Unknown company",
    ticker: analysis.ticker || "",
    website: analysis.website || "",
    quarter: analysis.quarter || "",
    date: analysis.date || "",
    summary: analysis.guidance?.summary || analysis.summary || "",
    sentiment: analysis.sentiment?.score ?? 0,
    sentimentLabel: analysis.sentiment?.label || "Unknown",
    guidance: analysis.guidance?.direction || "Not Given",
    guidanceNote: "From this call",
    revenueOutlook: analysis.revenue_outlook || "Not given",
    revenueNote: "Management guidance",
    riskFlags: (analysis.risk_flags ?? []).length,
    riskList: analysis.risk_flags ?? [],
    riskLevel: riskLevel((analysis.risk_flags ?? []).length),
    wordCount: analysis.word_count,
    takeaways: {
      bullish: bull.map((p) => p.text),
      bearish: bear.map((p) => p.text),
    },
    evidence: { bullish: bull, bearish: bear },
    timeline: analysis.timeline ?? [],
    source: analysis.source || "transcript",

    // The structured breakdown of the call itself.
    speakers: analysis.speakers ?? [],
    opening: analysis.opening ?? {},
    financials: analysis.financials ?? {},
    outlook: analysis.outlook ?? {},
    qa: analysis.qa ?? [],
  };
}

function riskLevel(count) {
  if (count >= 5) return "High";
  if (count >= 3) return "Medium";
  if (count >= 1) return "Low";
  return "None";
}

const DEMO = {
  ...demoCall,
  isDemo: true,
  callId: null,
  takeaways: demoTakeaways,
  riskList: [],
  evidence: { bullish: [], bearish: [] },
};

export default function useCallPal() {
  const [call, setCall] = useState(DEMO);
  const [prices, setPrices] = useState(null);
  const [recent, setRecent] = useState(demoRecent);

  const [status, setStatus] = useState("idle"); // idle | reading | analyzing | done
  const [error, setError] = useState("");

  const [messages, setMessages] = useState([]);
  const [asking, setAsking] = useState(false);

  // The stored library drives Calls, Trends, Compare and the rest.
  const [library, setLibrary] = useState([]);

  // The library pages should show a skeleton on first load rather than an
  // empty state that turns into content a moment later. "No calls yet" flashing
  // up before your calls appear is worse than a brief placeholder.
  const [libraryLoaded, setLibraryLoaded] = useState(false);

  const refreshLibrary = useCallback(async () => {
    try {
      setLibrary(await listCalls());
    } catch {
      setLibrary([]);
    } finally {
      setLibraryLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Market data follows whichever call is active.
  useEffect(() => {
    let cancelled = false;
    setPrices(null);

    const when = call.isDemo ? DEMO_DATE : call.date;

    fetchPrices(call.ticker, when).then((data) => {
      if (!cancelled) setPrices(data);
    });

    return () => {
      cancelled = true;
    };
  }, [call.ticker, call.date, call.isDemo]);

  const analyze = useCallback(async (file) => {
    if (!file) return;

    setError("");
    setMessages([]);

    // Transcribing a recording takes minutes, not seconds, so the upload card
    // needs to say something different while it waits.
    const media = /\.(mp3|wav|m4a|aac|ogg|flac|mp4|mov|webm)$/i.test(file.name);
    setStatus(media ? "transcribing" : "reading");

    try {
      if (!media) setStatus("analyzing");
      const analysis = await analyzeTranscript(file);
      const next = toCall(analysis);

      setCall(next);
      setStatus("done");
      refreshLibrary();

      // Newest call goes to the top of the list, no duplicate tickers.
      setRecent((list) => [
        {
          company: next.company,
          ticker: next.ticker,
          website: next.website,
          quarter: `${next.quarter} Earnings Call`,
          date: next.date || "Just analyzed",
        },
        ...list.filter((c) => c.ticker !== next.ticker),
      ]);
    } catch (err) {
      setStatus("idle");
      setError(readError(err));
    }
  }, [refreshLibrary]);

  // Same pipeline as an upload, except the transcript is fetched by ticker.
  const analyzeTicker = useCallback(
    async (symbol, quarter) => {
      setError("");
      setMessages([]);
      setStatus("fetching");

      try {
        const analysis = await analyzeSymbol(symbol, quarter);
        setCall(toCall(analysis));
        setStatus("done");
        refreshLibrary();
      } catch (err) {
        setStatus("idle");
        setError(readError(err));
      }
    },
    [refreshLibrary],
  );

  const openCall = useCallback(async (callId) => {
    try {
      const analysis = await getCall(callId);
      setCall(toCall(analysis));
      setMessages([]);
      setStatus("done");
      setError("");
    } catch {
      setError("Could not open that call.");
    }
  }, []);

  const removeCall = useCallback(
    async (callId) => {
      try {
        await deleteCall(callId);
        await refreshLibrary();
        setCall((c) => (c.callId === callId ? DEMO : c));
      } catch {
        setError("Could not delete that call.");
      }
    },
    [refreshLibrary],
  );

  const ask = useCallback(
    async (question) => {
      const text = question.trim();
      if (!text || asking) return;

      if (!call.callId) {
        setMessages((m) => [
          ...m,
          { role: "user", text },
          {
            role: "callpal",
            text: "Upload a transcript first — I can only answer from a call that has actually been analyzed.",
            grounded: false,
          },
        ]);
        return;
      }

      setMessages((m) => [...m, { role: "user", text }]);
      setAsking(true);

      try {
        const res = await askCallPal(call.callId, text);
        setMessages((m) => [
          ...m,
          {
            role: "callpal",
            text: res.answer,
            grounded: res.grounded,
            citations: res.citations ?? [],
          },
        ]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          { role: "callpal", text: readError(err), grounded: false, isError: true },
        ]);
      } finally {
        setAsking(false);
      }
    },
    [call.callId, asking],
  );

  const reset = useCallback(() => {
    setCall(DEMO);
    setRecent(demoRecent);
    setMessages([]);
    setError("");
    setStatus("idle");
  }, []);

  return {
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
    refreshLibrary,
  };
}

function readError(err) {
  const detail = err?.response?.data?.detail;
  if (detail) return detail;

  if (err?.code === "ECONNABORTED") {
    return "That took too long. Long transcripts can exceed the time limit — try a shorter one.";
  }

  if (!err?.response) {
    return "Could not reach the CallPal API. Make sure the backend is running on port 8000.";
  }

  return "Something went wrong analyzing that file.";
}
