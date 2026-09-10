const API = "/api";

function authHeaders(): HeadersInit {
  const token =
    (typeof localStorage !== "undefined" && localStorage.getItem("t2s-token")) ||
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("t2s-token")) ||
    "";
  if (!token || token === "t2s-offline-token") return {};
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers || {}) },
    ...init,
  });
  const text = await response.text();
  let body: { error?: string } = {};
  try {
    body = text ? (JSON.parse(text) as { error?: string }) : {};
  } catch {
    /* HTML 404 from an old Express process */
  }
  if (!response.ok) {
    throw new Error(
      body.error ||
        (response.status === 404
          ? "API route missing. Stop the old process on port 4000 and run npm start again."
          : response.status === 502 || response.status === 503 || response.status === 504
            ? "API is not running. Keep the npm start window open (both [api] and [web]). Open http://localhost:5173"
            : `Request failed (${response.status})`),
    );
  }
  return (body as T) || ({} as T);
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
    futureVwap?: number;
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
    kind?: "indicator" | "price-action" | "nifty-vwap" | "nifty-vwap-reversal" | "nifty-vwap-hedge";
    symbol?: string;
    instrument?: "future" | "option";
    optionType?: "CE" | "PE";
    strikeOffset?: number;
    side?: "BUY" | "SELL" | "BOTH";
    qty?: number;
    lots?: number;
    lotSize?: number;
    timeframe?: string;
    slPct?: number;
    targetPct?: number;
    initialSlPct?: number;
    trailingActivationPct?: number;
    trailingStepPct?: number;
    vwapExitCandles?: number;
    eodSquareOffMinutes?: number;
    strategyType?: string;
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
    buyConditions?: { join?: "and" | "or"; rows?: Array<{ left?: string; op?: string; right?: string; value?: number }> };
    sellConditions?: { join?: "and" | "or"; rows?: Array<{ left?: string; op?: string; right?: string; value?: number }> };
    summary?: string;
    dailyLiveIst?: string;
    mappingScope?: "master" | "clients" | "both";
    mappedClientIds?: string[];
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
    lastSignal?: string;
    trade?: {
      kind?: "future" | "option";
      symbol?: string;
      option?: "CE" | "PE" | "";
      strike?: number;
      expiry?: string;
      ltp?: number;
      label?: string;
      ready?: boolean;
      hint?: string;
    };
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
    live?: boolean;
    paper?: boolean;
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
  marketSession?: {
    status: string;
    open: boolean;
    reason?: string;
    hours?: string;
    weekday?: string;
    ist?: string;
  };
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
    ipCheck?: {
      detectedIP: string;
      primaryIP: string;
      secondaryIP: string;
      ipMatchStatus: string;
      ordersAllowed: boolean | null;
    } | null;
    autoRenew?: boolean;
    autoMode?: string;
    tokenExpiry?: string | null;
    nextRenewAt?: string | null;
    autoStart?: boolean;
    needsFresh?: boolean;
    renewalBlockedUntil?: string | null;
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

export type AuthUser = {
  id?: string;
  name: string;
  email: string;
  mobile?: string;
  desk: string;
  role?: "admin" | "user";
  authProvider?: string;
  createdAt?: string;
  lastLoginAt?: string;
  registered?: boolean;
  hasPassword?: boolean;
  thumbEnabled?: boolean;
};

export function login(identifier: string, password: string) {
  return request<{ token: string; user: AuthUser }>("/login", {
    method: "POST",
    body: JSON.stringify({ identifier, email: identifier, password }),
  });
}

export type OtpRequestResult = {
  ok: boolean;
  sent: boolean;
  channel?: "gmail" | "mobile";
  purpose?: string;
  newUser?: boolean;
  to?: string;
  hint?: string;
  devOtp?: string;
  gmail?: { connected?: boolean; user?: string };
};

export type OtpPurpose = "signup" | "login" | "reset";
export type SocialProvider = "google" | "microsoft" | "apple";

export function requestOtp(payload: {
  identifier: string;
  name?: string;
  channel?: "gmail" | "mobile";
  purpose?: OtpPurpose;
  provider?: SocialProvider;
}) {
  return request<OtpRequestResult>("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyOtp(payload: { identifier: string; otp: string; purpose?: OtpPurpose }) {
  return request<{ token?: string; user?: AuthUser; verified?: boolean; mail?: { delivered?: boolean } }>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(payload: { identifier: string; otp: string; password: string }) {
  return request<{ token: string; user: AuthUser }>("/auth/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function signup(payload: {
  name: string;
  identifier: string;
  otp: string;
  password: string;
  channel: "gmail" | "mobile";
}) {
  return request<{ token: string; user: AuthUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function enableThumb(token: string) {
  return request<{ ok: boolean; thumbToken: string; user: AuthUser }>("/auth/thumb/enable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function loginThumb(thumbToken: string) {
  return request<{ token: string; user: AuthUser }>("/auth/thumb", {
    method: "POST",
    body: JSON.stringify({ thumbToken }),
  });
}

export function googleAuthStatus() {
  return request<{ configured: boolean; redirectUri?: string }>("/auth/google/status");
}

export function googleAuthStartUrl() {
  const next = encodeURIComponent(window.location.origin);
  return `/api/auth/google?next=${next}`;
}

export function listUsers() {
  return request<{ users: AuthUser[] }>("/users");
}

export type ClientNotifications = {
  instantAlerts: boolean;
  eveningPnl: boolean;
  whatsapp: boolean;
  telegram: boolean;
};

export type ClientBroker = {
  id: string;
  name: string;
  color?: string;
  segments: string[];
};

export type ClientRow = {
  id: string;
  name: string;
  email?: string;
  mobile?: string;
  telegramId?: string;
  group: string;
  groups?: string[];
  brokerId: string;
  brokerName: string;
  brokerColor?: string;
  accountId?: string;
  linked: boolean;
  sizingKind: "multiplier" | "lots" | "fixed";
  sizingValue: number;
  tradeMode: "paper" | "real";
  copy: boolean;
  staticIp?: string;
  status: "LIVE" | "PAPER ONLY";
  subscriptionMode?: "copy" | "strategy" | "both";
  subscriptionUntil?: string;
  mappedStrategy?: string;
  segments?: string[];
  notifications?: ClientNotifications;
  tokenHint?: string;
  notes?: string;
  margin: number;
  createdAt?: string;
  lastLoginAt?: string;
};

export type ClientsList = {
  clients: ClientRow[];
  groups: string[];
  brokers: ClientBroker[];
  assignedIps: Record<string, string[]>;
  knownIps: string[];
  defaultUntil: string;
  strategies: Array<{ id: string; name: string }>;
  live: number;
  paper: number;
};

export function listClients() {
  return request<ClientsList>("/clients");
}

export function createClient(payload: {
  name: string;
  mobile: string;
  email?: string;
  brokerId?: string;
  accountId?: string;
  sizingKind?: ClientRow["sizingKind"];
  sizingValue?: number;
  tradeMode?: ClientRow["tradeMode"];
  copy?: boolean;
  subscriptionMode?: ClientRow["subscriptionMode"];
  subscriptionUntil?: string;
  group?: string;
  groups?: string[];
  telegramId?: string;
  mappedStrategy?: string;
  segments?: string[];
  notifications?: Partial<ClientNotifications>;
  brokerToken?: string;
  notes?: string;
  staticIp?: string;
}) {
  return request<{ client: ClientRow }>("/clients", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveClient(id: string, payload: Partial<ClientRow> & { name?: string; mobile?: string; telegramId?: string }) {
  return request<{ client: ClientRow }>(`/clients/${encodeURIComponent(id)}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteClient(id: string) {
  return request<{ ok: boolean; id: string }>(`/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export type EgressBrokerSlot = { id: string; name: string; color?: string };

export type EgressAssignment = {
  userId: string;
  name: string;
  brokerId: string;
  brokerName: string;
  brokerColor?: string;
  accountId?: string;
};

export type EgressAccountRow = {
  userId: string;
  name: string;
  kind: "master" | "child";
  brokerId: string;
  brokerName: string;
  brokerColor?: string;
  accountId?: string;
  staticIp: string;
  status: "active" | "inactive";
};

export type EgressIpCard = {
  address: string;
  family: "ipv4" | "ipv6";
  label: string;
  status: "healthy" | "failed" | "untested";
  lastTestAt?: string;
  lastTestError?: string;
  assignedCount: number;
  slotsUsed: number;
  slotsMax: number;
  assigned: EgressAssignment[];
  availableSlots: EgressBrokerSlot[];
};

export type IpManagementSnapshot = {
  slots: EgressBrokerSlot[];
  stats: {
    ipv4: number;
    ipv6: number;
    healthy: number;
    assignments: number;
    brokersCovered: number;
    serverDefault: number;
  };
  ips: EgressIpCard[];
  accounts: EgressAccountRow[];
  unassigned: EgressAssignment[];
  test?: { ok: boolean; seen?: string; error?: string };
};

export function listStaticIps() {
  return request<IpManagementSnapshot>("/ips");
}

export function addStaticIp(payload: { address: string; label?: string }) {
  return request<IpManagementSnapshot>("/ips", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteStaticIp(address: string) {
  return request<IpManagementSnapshot>(`/ips/${encodeURIComponent(address)}`, { method: "DELETE" });
}

export function testStaticIp(address: string) {
  return request<IpManagementSnapshot>(`/ips/${encodeURIComponent(address)}/test`, { method: "POST" });
}

export function assignStaticIp(address: string, payload: { userId: string; brokerId?: string }) {
  return request<IpManagementSnapshot>(`/ips/${encodeURIComponent(address)}/assign`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function unassignStaticIp(userId: string) {
  return request<IpManagementSnapshot>("/ips/unassign", { method: "POST", body: JSON.stringify({ userId }) });
}

export type CatalogStrategy = {
  id: string;
  name: string;
  tag?: string;
  kind?: string;
  summary?: string;
  symbol?: string;
  timeframe?: string;
  enrollFee: number;
};

export type PaymentPublic = {
  ready: boolean;
  mobile?: string;
  mobileMasked?: string;
  upiId?: string;
  amount: number;
  payeeName?: string;
};

export type Enrollment = {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  strategyId: string;
  strategyName: string;
  amount: number;
  channel?: string;
  status: "pending" | "paid" | string;
  payeeMobile?: string;
  createdAt?: string;
  paidAt?: string;
};

export type UpiLinks = {
  upi: string;
  gpay: string;
  phonepe: string;
  qr?: string;
};

export function strategyCatalog() {
  return request<{ strategies: CatalogStrategy[]; payments: PaymentPublic }>("/strategies/catalog");
}

export function listEnrollments() {
  return request<{ enrollments: Enrollment[] }>("/subscriptions");
}

export function enrollStrategy(strategyId: string, channel: "gpay" | "phonepe") {
  return request<{ enrollment: Enrollment; payments: PaymentPublic; links: UpiLinks | null; already?: boolean }>(
    "/subscriptions/enroll",
    { method: "POST", body: JSON.stringify({ strategyId, channel }) },
  );
}

export function confirmEnrollmentPaid(id: string) {
  return request<{ enrollment: Enrollment }>(`/subscriptions/${id}/paid`, { method: "POST" });
}

export function getPaymentSettings() {
  return request<{ payments: { mobile: string; upiId: string; amount: number; payeeName: string } }>("/payments");
}

export function savePaymentSettings(payload: { mobile: string; upiId?: string; amount: number; payeeName?: string }) {
  return request<{ ok: boolean; payments: { mobile: string; upiId: string; amount: number; payeeName: string } }>("/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type MemberBrokerChoice = {
  id: string;
  name: string;
  vendor?: string;
  color?: string;
  segments?: string[];
  virtual?: boolean;
  selectable?: boolean;
  selected?: boolean;
  mode?: string;
  note?: string;
};

export type MemberWallet = {
  balance: number;
  mtm: number;
  equity: number;
  updatedAt?: string;
};

export type MemberPlanRow = {
  strategyId: string;
  strategyName: string;
  status: string;
  realizedPnl: number;
  unrealizedPnl: number;
  netPnl: number;
  openPositions: number;
  trades: number;
};

export type WalletTopup = {
  id: string;
  userId?: string;
  userName?: string;
  userEmail?: string;
  amount: number;
  channel?: string;
  status: "pending" | "paid" | string;
  createdAt?: string;
  paidAt?: string;
};

export type MemberPosition = {
  id: string;
  symbol: string;
  type: "BUY" | "SELL" | string;
  qty: number;
  avg: number;
  ltp: number;
  pnl: number;
  brokerId?: string;
  strategy?: string;
};

export type MemberDesk = {
  wallet: MemberWallet;
  brokerId: string;
  brokers: MemberBrokerChoice[];
  plans: MemberPlanRow[];
  report: DeskReport;
  positions: MemberPosition[];
  topups: WalletTopup[];
  payments: PaymentPublic;
};

export type MemberIndexQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  spark?: number[];
  future?: number;
  futureExpiry?: string;
  lot?: number;
};

export function getMemberQuotes() {
  return request<{ indices: MemberIndexQuote[] }>("/member/quotes");
}

export function getMemberDesk() {
  return request<MemberDesk>("/member/desk");
}

export function selectMemberBroker(brokerId: string) {
  return request<{ brokerId: string; brokers: MemberBrokerChoice[] }>("/member/broker", {
    method: "POST",
    body: JSON.stringify({ brokerId }),
  });
}

export function startWalletTopup(amount: number, channel: "gpay" | "phonepe") {
  return request<{ topup: WalletTopup; payments: PaymentPublic; links: UpiLinks | null }>("/member/wallet/topup", {
    method: "POST",
    body: JSON.stringify({ amount, channel }),
  });
}

export function confirmWalletTopup(id: string) {
  return request<{ topup: WalletTopup; wallet: { balance: number; updatedAt?: string } }>(`/member/wallet/topup/${id}/paid`, {
    method: "POST",
  });
}

export function listWalletTopups() {
  return request<{ topups: WalletTopup[] }>("/member/topups");
}

export function getMe(token: string) {
  return request<{ user: AuthUser }>(`/me?token=${encodeURIComponent(token)}`);
}

export function updateProfile(token: string, payload: { name: string; email?: string; mobile?: string }) {
  return request<{ ok: boolean; user: AuthUser }>("/me", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ token, ...payload }),
  });
}

export function getGmailStatus() {
  return request<{ connected: boolean; user?: string }>("/auth/gmail");
}

export function connectGmail(email: string, appPassword: string) {
  return request<{ ok: boolean; connected: boolean; user?: string }>("/auth/gmail", {
    method: "POST",
    body: JSON.stringify({ email, appPassword }),
  });
}

export function getSnapshot() {
  return request<Snapshot>("/snapshot");
}

export function getDeskMtm() {
  return request<{
    positions: Array<{ id: string; symbol: string; ltp: number; pnl: number; strategy?: string }>;
    serverTime?: string;
  }>("/mtm");
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
  afterMarketOrder?: boolean;
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

export type LedgerPosition = {
  id: string;
  symbol: string;
  product: string;
  type: "BUY" | "SELL";
  buyQty: number;
  buyPrice: number;
  sellQty: number;
  sellPrice: number;
  netQty: number;
  ltp: number;
  realized: number;
  mtm: number;
  paper: boolean;
  segment: "indian" | "crypto";
  strategy?: string;
};

export type PositionLedger = {
  id: string;
  name: string;
  kind: "master" | "client";
  title: string;
  subtitle: string;
  tradeMode: "paper" | "real";
  positions: LedgerPosition[];
  mtm: number;
  realized: number;
  open: number;
};

export type PositionsDeskSnapshot = {
  master: PositionLedger;
  clients: PositionLedger[];
  masterMtm: number;
  clientMtm: number;
  totalMtm: number;
  openPositions: number;
};

export function getPositionsDesk() {
  return request<PositionsDeskSnapshot>("/positions/desk");
}

export function sendChat(text: string) {
  return request("/chat", { method: "POST", body: JSON.stringify({ text }) });
}

export type MessagingChannelStatus = {
  kind: "whatsapp" | "telegram";
  ready: boolean;
  label: string;
  hint?: string;
};

export type MessagingConversation = {
  id: string;
  name: string;
  mobile?: string;
  telegramId?: string;
  broker?: string;
  channels: Array<"whatsapp" | "telegram">;
  preview?: string;
  lastAt?: string;
};

export type MessagingMessage = {
  id: string;
  from: string;
  text: string;
  via?: string;
  at?: string;
  mine?: boolean;
  status?: string;
  error?: string;
};

export function getMessaging() {
  return request<{
    sendVia: "both" | "whatsapp" | "telegram";
    whatsapp: MessagingChannelStatus;
    telegram: MessagingChannelStatus;
    conversations: MessagingConversation[];
  }>("/messaging");
}

export function saveMessagingConfig(payload: {
  sendVia?: "both" | "whatsapp" | "telegram";
  whatsappToken?: string;
  phoneNumberId?: string;
  telegramToken?: string;
}) {
  return request<{
    sendVia: "both" | "whatsapp" | "telegram";
    whatsapp: MessagingChannelStatus;
    telegram: MessagingChannelStatus;
    conversations: MessagingConversation[];
  }>("/messaging/config", { method: "POST", body: JSON.stringify(payload) });
}

export function addMessagingContact(payload: { name: string; mobile?: string; telegramId?: string; broker?: string }) {
  return request<{ contact: MessagingConversation }>("/messaging/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMessagingThread(id: string) {
  return request<{ messages: MessagingMessage[] }>(`/messaging/thread/${encodeURIComponent(id)}`);
}

export function sendMessaging(payload: { contactId: string; text: string; via?: "both" | "whatsapp" | "telegram" }) {
  return request<{ ok: boolean; message: MessagingMessage; warnings?: string[] }>("/messaging/send", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function broadcastMessaging(payload: { text: string; via?: "both" | "whatsapp" | "telegram" }) {
  return request<{ ok: boolean; sent: number; failed: number; errors?: Array<{ name: string; error: string }> }>(
    "/messaging/broadcast",
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function enableDhanAuto(payload: {
  clientId?: string;
  loginId?: string;
  pin?: string;
  password?: string;
  totpSecret?: string;
}) {
  return request<{
    ok: boolean;
    live?: boolean;
    rotated?: boolean;
    method?: string;
    error?: string;
    tokenHint?: string;
    autoMode?: string;
    tokenExpiry?: string;
    nextRenewAt?: string;
    snapshot?: Snapshot;
  }>("/brokers/dhan/auto", { method: "POST", body: JSON.stringify(payload) });
}

export function refreshDhanToken(
  payload: {
    clientId?: string;
    loginId?: string;
    pin?: string;
    password?: string;
    totpSecret?: string;
  } = {},
) {
  return request<{
    ok: boolean;
    live?: boolean;
    rotated?: boolean;
    method?: string;
    error?: string;
    tokenHint?: string;
    autoMode?: string;
    tokenExpiry?: string;
    nextRenewAt?: string;
    snapshot?: Snapshot;
  }>("/brokers/dhan/reset", { method: "POST", body: JSON.stringify(payload) });
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
