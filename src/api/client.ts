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
    callOi?: number;
    callOiChg?: number;
    callVol?: number;
    callIv?: number;
    callDelta?: number;
    putLtp: number;
    putChg: number;
    putOi?: number;
    putOiChg?: number;
    putVol?: number;
    putIv?: number;
    putDelta?: number;
    atm?: boolean;
  }>;
  optionMeta?: {
    symbol: string;
    expiry: string;
    expiries: string[];
    spot: number;
    pcr: number;
    maxPain: number;
    atmIv: number;
    source: string;
    lastAt: number | null;
    underlyings?: Array<{ id: string; label: string; lot: number }>;
  };
  algos: Array<{
    id: string;
    name: string;
    tag: string;
    status: "LIVE" | "PAUSED";
    pnl: number;
    winRate: number;
    enabled: boolean;
    brokerId?: string;
  }>;
  positions: Array<{
    id: string;
    symbol: string;
    type: "BUY" | "SELL";
    qty: number;
    avg: number;
    ltp: number;
    pnl: number;
    brokerId?: string;
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
  pnlByBroker: Record<string, number>;
  brokers: BrokerAccount[];
  activeBrokerId: string;
  mainBrokerId?: string;
  marketStatus: string;
  serverTime: string;
  dhanFeed?: {
    live: boolean;
    source: string;
    lastTickAt: number | null;
    error: string | null;
    tokenHint: string | null;
    profileName: string | null;
    clientId?: string | null;
    quoteCount?: number;
    positionCount?: number;
    holdingCount?: number;
  };
};

export type BrokerAccount = {
  id: string;
  name: string;
  vendor: string;
  color: string;
  auth: string;
  segments: string[];
  main?: boolean;
  connected: boolean;
  active: boolean;
  mode: string;
  clientId: string;
  funds: number;
  marginUsed: number;
  status: "CONNECTED" | "DISCONNECTED" | "REAUTH" | "LIVE";
  keyHint: string;
  liveFeed?: boolean;
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

export function connectBroker(id: string, payload: { clientId: string; apiKey?: string; accessToken?: string }) {
  return request<{ snapshot: Snapshot }>(`/brokers/${id}/connect`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function disconnectBroker(id: string) {
  return request<{ snapshot: Snapshot }>(`/brokers/${id}/disconnect`, { method: "POST" });
}

export function activateBroker(id: string) {
  return request<{ snapshot: Snapshot }>(`/brokers/${id}/activate`, { method: "POST" });
}

export function assignAlgoBroker(id: string, brokerId: string) {
  return request(`/algos/${id}/broker`, { method: "POST", body: JSON.stringify({ brokerId }) });
}

export function selectOptionChain(symbol: string, expiry?: string) {
  return request<{ snapshot: Snapshot }>(`/option-chain/select`, {
    method: "POST",
    body: JSON.stringify({ symbol, expiry }),
  });
}
