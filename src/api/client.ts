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

export type DeskOrder = {
  id: string;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  filledQty?: number;
  price: number;
  product?: string;
  type?: string;
  status: "PENDING" | "PARTIAL" | "FILLED" | "REJECTED" | "CANCELLED" | string;
  strategy?: string;
  brokerId?: string;
  brokerName?: string;
  reason?: string;
  createdAt?: string;
};

export type DeskReport = {
  date: string;
  realizedPnl: number;
  unrealizedPnl: number;
  grossPnl: number;
  charges: number;
  netPnl: number;
  openPositions: number;
  ordersToday: number;
  filledToday: number;
  pendingToday: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  turnover: number;
  byBroker: Array<{ id: string; trades: number; wins: number; pnl: number; unrealized?: number; winRate: number }>;
  byStrategy: Array<{ name: string; trades: number; wins: number; pnl: number; winRate: number }>;
  bySymbol: Array<{ symbol: string; trades: number; wins: number; pnl: number; winRate: number }>;
  daily: Array<{ date: string; pnl: number; trades: number; unrealized?: number }>;
  tradeBook: Array<{
    id: string;
    symbol: string;
    side: "BUY" | "SELL";
    qty: number;
    entry: number;
    exit: number;
    pnl: number;
    product?: string;
    strategy?: string;
    brokerId?: string;
    closedAt?: string;
    status?: string;
  }>;
};

export type Snapshot = {
  indices: Array<{
    symbol: string;
    name: string;
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
    futureSegment?: string;
    lot?: number;
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
    callBuy?: number;
    callSell?: number;
    callVwap?: number;
    callId?: number;
    putLtp: number;
    putChg: number;
    putOi?: number;
    putOiChg?: number;
    putVol?: number;
    putIv?: number;
    putDelta?: number;
    putBuy?: number;
    putSell?: number;
    putVwap?: number;
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
    lastAt: number | null;
    expiryLabel?: string;
    expiryLabels?: Record<string, string>;
    contractIds?: number;
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
    buyLeft?: string;
    buyOp?: string;
    buyRight?: string;
    buyValue?: number;
    sellLeft?: string;
    sellOp?: string;
    sellRight?: string;
    sellValue?: number;
    summary?: string;
    runMode?: "live" | "paper" | "backtest";
    lastBacktest?: {
      ranAt?: string;
      timeframe?: string;
      bars?: number;
      trades?: number;
      wins?: number;
      losses?: number;
      winRate?: number;
      pnl?: number;
      maxDrawdown?: number;
      sample?: boolean;
      source?: string;
      range?: "1y" | "custom" | string;
      from?: string;
      to?: string;
      book?: Array<{ side: string; entry: number; exit: number; qty: number; pnl: number; bars: number }>;
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
  orders: DeskOrder[];
  report?: DeskReport;
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
  futures?: Array<{
    root: string;
    parent: string;
    symbol: string;
    name: string;
    kind: "future";
    expiry: string;
    segment: string;
    lot: number;
    qty: number;
    front?: boolean;
    tradable?: boolean;
  }>;
  contracts?: {
    indices: Array<{
      root: string;
      parent: string;
      symbol: string;
      kind: "index";
      segment: string;
      lot: number;
      tradable: boolean;
      note?: string;
    }>;
    futures: Snapshot["futures"];
    optionCount?: number;
  };
};

export type LiveContract = {
  root: string;
  parent?: string;
  symbol: string;
  kind: "index" | "future" | "option";
  segment: string;
  lot: number;
  qty?: number;
  expiry?: string;
  strike?: number;
  option?: "CE" | "PE";
  tradable?: boolean;
  front?: boolean;
  note?: string;
  name?: string;
};

export type OptionStrikeContract = {
  root: string;
  parent: string;
  strike: number;
  expiry: string;
  hasCall?: boolean;
  hasPut?: boolean;
  segment: string;
  lot: number;
  qty: number;
  tradable: boolean;
};

export type ContractCatalog = {
  indices: LiveContract[];
  futures: LiveContract[];
  options: LiveContract[];
  optionStrikes: OptionStrikeContract[];
  counts: { indices: number; futures: number; options: number; strikes: number };
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
  return request<ContractCatalog>(`/contracts${suffix}`);
}

export function getCandles(tf: string) {
  return request<Array<{ time: number; open: number; high: number; low: number; close: number; volume: number }>>(
    `/candles?tf=${encodeURIComponent(tf)}`,
  );
}

export function toggleAlgo(id: string) {
  return request(`/algos/${id}/toggle`, { method: "POST" });
}

export type PlaceOrderResult = {
  ok: boolean;
  live?: boolean;
  warning?: string;
  error?: string;
  order?: DeskOrder;
  snapshot?: Snapshot;
};

export function placeOrder(payload: Record<string, unknown>) {
  return request<PlaceOrderResult>("/orders", { method: "POST", body: JSON.stringify(payload) });
}

export function cancelOrder(id: string) {
  return request<{ snapshot: Snapshot }>(`/orders/${id}/cancel`, { method: "POST" });
}

export function squareOff(id: string) {
  return request<{ snapshot: Snapshot }>(`/positions/${id}/squareoff`, { method: "POST" });
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

export function createAlgo(payload: Record<string, unknown>) {
  return request<{ snapshot: Snapshot }>(`/algos`, { method: "POST", body: JSON.stringify(payload) });
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
  return request<{ snapshot: Snapshot; backtest?: Record<string, unknown>; algo?: Snapshot["algos"][number] }>(
    `/algos/${id}/backtest`,
    { method: "POST", body: JSON.stringify(options) },
  );
}

export function selectOptionChain(symbol: string, expiry?: string) {
  return request<{ snapshot: Snapshot }>(`/option-chain/select`, {
    method: "POST",
    body: JSON.stringify({ symbol, expiry }),
  });
}
