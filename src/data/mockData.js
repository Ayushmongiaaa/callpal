// Mock data for the UI-first build. Every field here is what the backend will
// eventually return, so swapping in real analysis later is a data change and not
// a rewrite of the components.

export const featuredCall = {
  company: "NVIDIA Corporation",
  ticker: "NVDA",
  website: "nvidia.com",
  logoColor: "#76b900",
  quarter: "Q2 FY2025",
  date: "May 22, 2024",
  duration: "1h 18m",
  summary:
    "NVIDIA delivered a strong quarter with beats on revenue and EPS. Management raised guidance driven by robust AI demand and data center growth.",
  sentiment: 82,
  sentimentLabel: "Very Positive",
  guidance: "Raised",
  guidanceNote: "vs. Prior Quarter",
  revenueOutlook: "$28.0B",
  revenueNote: "Q3 Est. Revenue",
  revenueChange: "+9.3%",
  riskFlags: 3,
  riskLevel: "Medium",
  priceChange: "+6.21%",
};

export const sentimentTrend = [
  { minute: 0, sentiment: 61, price: 940 },
  { minute: 5, sentiment: 64, price: 948 },
  { minute: 10, sentiment: 70, price: 962 },
  { minute: 15, sentiment: 68, price: 958 },
  { minute: 20, sentiment: 74, price: 975 },
  { minute: 25, sentiment: 79, price: 988 },
  { minute: 30, sentiment: 76, price: 981 },
  { minute: 35, sentiment: 83, price: 996 },
  { minute: 40, sentiment: 86, price: 1008 },
  { minute: 45, sentiment: 81, price: 999 },
  { minute: 50, sentiment: 88, price: 1016 },
  { minute: 55, sentiment: 90, price: 1024 },
  { minute: 60, sentiment: 87, price: 1019 },
];

export const guidanceBars = [
  { q: "1", v: 42 },
  { q: "2", v: 55 },
  { q: "3", v: 48 },
  { q: "4", v: 63 },
  { q: "5", v: 58 },
  { q: "6", v: 71 },
  { q: "7", v: 66 },
  { q: "8", v: 80 },
  { q: "9", v: 74 },
  { q: "10", v: 88 },
];

export const sentimentSpark = [
  { i: 0, v: 40 },
  { i: 1, v: 46 },
  { i: 2, v: 43 },
  { i: 3, v: 55 },
  { i: 4, v: 62 },
  { i: 5, v: 58 },
  { i: 6, v: 71 },
  { i: 7, v: 82 },
];

export const takeaways = {
  bullish: [
    "Record data center revenue, up 154% YoY",
    "Raised Q3 revenue guidance above estimates",
    "Strong demand for Blackwell architecture",
    "Gross margins expanded sequentially",
  ],
  bearish: [
    "China export restrictions remain a headwind",
    "High expectations may limit near-term upside",
    "Supply constraints could impact Q4",
    "Increased capex may pressure free cash flow margins",
  ],
};

export const suggestedQuestions = [
  "What were the key drivers of this quarter?",
  "How does management view the second half of the year?",
  "What are the biggest risks mentioned?",
  "Compare guidance to the previous quarter",
];

export const recentCalls = [
  {
    company: "NVIDIA Corporation",
    ticker: "NVDA",
    website: "nvidia.com",
    quarter: "Q2 FY2025 Earnings Call",
    date: "May 22, 2024",
    color: "#76b900",
  },
  {
    company: "Microsoft Corporation",
    ticker: "MSFT",
    website: "microsoft.com",
    quarter: "Q3 2024 Earnings Call",
    date: "Apr 30, 2024",
    color: "#00a4ef",
  },
  {
    company: "Apple Inc.",
    ticker: "AAPL",
    website: "apple.com",
    quarter: "Q2 2024 Earnings Call",
    date: "May 2, 2024",
    color: "#e5e5e5",
  },
];
