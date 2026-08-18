const API = "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type Snapshot = {
  indices: Array<{
    symbol: string;
    name: string;
    price: number;
    change: number;
    changePct: number;
    spark: number[];
  }>;
  ohlc: { open: number; high: number; low: number; close: number };
  dnaScores: Array<{ label: string; value: number }>;
  optionChain: Array<{
    strike: number;
    callLtp: number;
    callChg: number;
    putLtp: number;
    putChg: number;
    atm?: boolean;
  }>;
  algos: Array<{
    id: string;
    name: string;
    tag: string;
    status: "LIVE" | "PAUSED";
    pnl: number;
    winRate: number;
    enabled: boolean;
  }>;
  positions: Array<{
    id: string;
    symbol: string;
    type: "BUY" | "SELL";
    qty: number;
    avg: number;
    ltp: number;
    pnl: number;
  }>;
  signals: Array<{
    id: string;
    action: "BUY" | "SELL";
    symbol: string;
    strategy: string;
    time: string;
    confidence: number;
  }>;
  watchlist: Array<{ symbol: string; ltp: number; chg: number }>;
  fiiDii: {
    fii: { buy: number; sell: number; net: number };
    dii: { buy: number; sell: number; net: number };
  };
  marketWatch: Array<{ symbol: string; ltp: number; chg: number; volume: string }>;
  featuredSignal: {
    action: "BUY" | "SELL";
    symbol: string;
    strategy: string;
    expiry: string;
    confidence: number;
    risk: string;
    metrics: Array<{ label: string; value: number }>;
  };
  sentiment: number;
  orders: Array<Record<string, unknown>>;
  notifications: string[];
  chat: Array<{ from: string; text: string; mine?: boolean }>;
  settings: Record<string, string>;
  totalPnl: number;
  marketStatus: string;
  serverTime: string;
};

export function login(email: string, password: string) {
  return request<{ token: string; user: { name: string; email: string; desk: string } }>("/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getSnapshot() {
  return request<Snapshot>("/snapshot");
}

export function getCandles(tf: string) {
  return request<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>>(
    `/candles?tf=${encodeURIComponent(tf)}`,
  );
}

export function toggleAlgo(id: string) {
  return request(`/algos/${id}/toggle`, { method: "POST" });
}

export function placeOrder(payload: Record<string, unknown>) {
  return request("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function sendChat(text: string) {
  return request("/chat", { method: "POST", body: JSON.stringify({ text }) });
}
