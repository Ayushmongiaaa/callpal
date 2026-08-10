import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

/**
 * Whether we are talking to a deployed API rather than one on this machine.
 *
 * The two failure modes need different words. Locally, an unreachable API means
 * the developer has not started it, and the fix is a command. Deployed, it
 * almost always means the free instance has gone to sleep and is waking up —
 * telling a visitor to run a shell script would be nonsense.
 */
export const IS_HOSTED = !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(API_URL);

const api = axios.create({
  baseURL: API_URL,
  // Transcribing an hour of audio is slow, and a cold hosted backend is slower.
  timeout: 300000,
});

export async function analyzeTranscript(file) {
  const form = new FormData();
  form.append("file", file);

  const { data } = await api.post("/analyze", form);
  return data;
}

export async function askCallPal(callId, question) {
  const { data } = await api.post("/chat", { call_id: callId, question });
  return data;
}

export async function listCalls() {
  const { data } = await api.get("/calls");
  return data.calls ?? [];
}

export async function getCall(callId) {
  const { data } = await api.get(`/calls/${callId}`);
  return data;
}

export async function getTranscript(callId) {
  const { data } = await api.get(`/calls/${callId}/transcript`);
  return data.text;
}

export async function deleteCall(callId) {
  await api.delete(`/calls/${callId}`);
}

export async function getStats() {
  const { data } = await api.get("/stats");
  return data;
}

/** Companies matching a search box query. */
export async function searchCompanies(q) {
  const { data } = await api.get("/search", { params: { q }, timeout: 20000 });
  return data;
}

/** Pull a published transcript for a ticker and analyze it. */
export async function analyzeSymbol(symbol, quarter) {
  const { data } = await api.post(`/analyze/${symbol}`, null, {
    params: quarter ? { quarter } : {},
  });
  return data;
}

/**
 * Real closes around the call from Yahoo Finance.
 * Returns null rather than throwing when the ticker has no market data —
 * private, foreign-listed or fictional companies are an expected case.
 */
export async function fetchPrices(ticker, callDate) {
  if (!ticker) return null;

  try {
    const { data } = await api.get("/prices", {
      params: { ticker, call_date: callDate },
    });
    return data;
  } catch {
    return null;
  }
}

export async function health() {
  // A shorter timeout than the shared one on purpose. The 5-minute default
  // exists for transcription; a health check that hangs for five minutes is
  // indistinguishable from a dead page. A free Render instance takes 30–60s to
  // wake, so 75s is long enough to survive a cold start and short enough to
  // actually report failure.
  const { data } = await api.get("/health", { timeout: 75000 });
  return data;
}
