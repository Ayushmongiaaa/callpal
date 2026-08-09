import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

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
  const { data } = await api.get("/health");
  return data;
}
