import Constants from "expo-constants";

export function apiBase() {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env.replace(/\/$/, "");
  const hostUri = Constants.expoConfig?.hostUri || "";
  const ip = hostUri.match(/(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (ip) return `http://${ip}:4000`;
  return "http://localhost:4000";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase()}/api${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export type Snapshot = {
  indices: Array<{
    symbol: string;
    price: number;
    change: number;
    changePct: number;
    spark: number[];
    future?: number;
    vwap?: number;
    prevClose?: number;
    securityId?: number;
    indexId?: number;
    futureId?: string;
    futureExpiry?: string;
    lot?: number;
  }>;
  ohlc: { open: number; high: number; low: number; close: number };
  dnaScores: Array<{ label: string; value: number }>;
  optionChain: Array<{
    strike: number;
    callLtp: number;
    callChg: number;
    callOi?: number;
    callId?: number;
    putLtp: number;
    putChg: number;
    putOi?: number;
    putId?: number;
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
    expiryLabel?: string;
    expiryLabels?: Record<string, string>;
    underlyings?: Array<{ id: string; label: string; lot: number }>;
  };
  algos: Array<{
    id: string;
    name: string;
    tag: string;
    kind?: "indicator" | "price-action";
    symbol?: string;
    side?: "BUY" | "SELL" | "BOTH";
    qty?: number;
    lots?: number;
    lotSize?: number;
    buyLeft?: string;
    buyOp?: string;
    buyRight?: string;
    buyValue?: number;
    sellLeft?: string;
    sellOp?: string;
    sellRight?: string;
    sellValue?: number;
    timeframe?: string;
    slPct?: number;
    targetPct?: number;
    indicator?: string;
    period?: number;
    fast?: number;
    slow?: number;
    rsiBuy?: number;
    rsiSell?: number;
    multiplier?: number;
    pattern?: string;
    rangeMinutes?: number;
    lookback?: number;
    summary?: string;
    runMode?: "live" | "paper" | "backtest";
    lastBacktest?: {
      trades?: number;
      winRate?: number;
      pnl?: number;
      sample?: boolean;
      timeframe?: string;
      bars?: number;
      range?: string;
      from?: string;
      to?: string;
    };
    status: "LIVE" | "PAUSED" | "PAPER" | "BACKTEST";
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
    product?: string;
    strategy?: string;
    openedAt?: string;
    brokerId?: string;
    securityId?: string;
  }>;
  orders?: Array<{
    id: string;
    symbol: string;
    side: "BUY" | "SELL";
    qty: number;
    filledQty?: number;
    price: number;
    product?: string;
    type?: string;
    status: string;
    strategy?: string;
    brokerId?: string;
    brokerName?: string;
    reason?: string;
    createdAt?: string;
  }>;
  report?: {
    date: string;
    realizedPnl: number;
    unrealizedPnl: number;
    grossPnl: number;
    charges: number;
    netPnl: number;
    trades: number;
    wins: number;
    losses: number;
    winRate: number;
    byStrategy: Array<{ name: string; trades: number; wins: number; pnl: number; winRate: number }>;
    tradeBook: Array<{
      id: string;
      symbol: string;
      side: "BUY" | "SELL";
      qty: number;
      entry: number;
      exit: number;
      pnl: number;
      strategy?: string;
      closedAt?: string;
    }>;
  };
  signals: Array<{ id: string; action: "BUY" | "SELL"; symbol: string; strategy: string; time: string; confidence: number }>;
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
  fiiDii: { fii: { buy: number; sell: number; net: number }; dii: { buy: number; sell: number; net: number } };
  sentiment: number;
  notifications: string[];
  totalPnl: number;
  pnlByBroker?: Record<string, number>;
  brokers?: BrokerAccount[];
  activeBrokerId?: string;
  mainBrokerId?: string;
  marketStatus: string;
  dhanFeed?: {
    live: boolean;
    source: string;
    lastTickAt: number | null;
    error: string | null;
    tokenHint: string | null;
    profileName: string | null;
    clientId?: string | null;
    quoteCount?: number;
  };
  futures?: Array<{
    root: string;
    parent: string;
    symbol: string;
    name: string;
    expiry: string;
    segment: string;
    lot: number;
    qty: number;
    front?: boolean;
  }>;
};

export type BrokerAccount = {
  id: string;
  name: string;
  vendor: string;
  color: string;
  main?: boolean;
  connected: boolean;
  active: boolean;
  mode: string;
  clientId: string;
  funds: number;
  marginUsed: number;
  status: string;
  segments: string[];
  keyHint?: string;
  liveFeed?: boolean;
  virtual?: boolean;
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

export function getContracts(symbol?: string, expiry?: string) {
  const query = new URLSearchParams();
  if (symbol) query.set("symbol", symbol);
  if (expiry) query.set("expiry", expiry);
  const suffix = query.toString() ? `?${query}` : "";
  return request<{
    indices: Array<{ symbol: string; segment: string; lot: number; tradable?: boolean }>;
    futures: Array<{ symbol: string; name?: string; expiry: string; segment: string; lot: number; qty?: number; front?: boolean }>;
    options: Array<{ symbol: string; option: "CE" | "PE"; strike: number; expiry: string; segment: string; lot: number }>;
    counts: { indices: number; futures: number; options: number; strikes: number };
  }>(`/contracts${suffix}`);
}

export function toggleAlgo(id: string) {
  return request(`/algos/${id}/toggle`, { method: "POST" });
}

export function createAlgo(payload: Record<string, unknown>) {
  return request<{ snapshot: Snapshot }>("/algos", { method: "POST", body: JSON.stringify(payload) });
}

export function updateAlgo(id: string, payload: Record<string, unknown>) {
  return request<{ snapshot: Snapshot }>(`/algos/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteAlgo(id: string) {
  return request<{ snapshot: Snapshot }>(`/algos/${id}`, { method: "DELETE" });
}

export type BacktestOptions = {
  range?: "1y" | "custom";
  from?: string;
  to?: string;
};

export function backtestAlgo(id: string, options: BacktestOptions = {}) {
  return request<{ snapshot: Snapshot }>(`/algos/${id}/backtest`, {
    method: "POST",
    body: JSON.stringify(options),
  });
}

export function placeOrder(payload: Record<string, unknown>) {
  return request<{ ok: boolean; live?: boolean; warning?: string; snapshot?: Snapshot }>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelOrder(id: string) {
  return request<{ snapshot: Snapshot }>(`/orders/${id}/cancel`, { method: "POST" });
}

export function squareOff(id: string) {
  return request<{ snapshot: Snapshot }>(`/positions/${id}/squareoff`, { method: "POST" });
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

export function selectOptionChain(symbol: string, expiry?: string) {
  return request<{ snapshot: Snapshot }>("/option-chain/select", {
    method: "POST",
    body: JSON.stringify({ symbol, expiry }),
  });
}
