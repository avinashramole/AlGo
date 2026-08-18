function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const MAIN_BROKER_ID = "dhan";

export const catalog = [
  { id: "dhan", name: "Dhan", vendor: "Dhan", color: "#0f9d58", auth: "access_token", segments: ["EQ", "FNO"], main: true },
  { id: "zerodha", name: "Zerodha Kite", vendor: "Zerodha", color: "#f6461a", auth: "api_key", segments: ["EQ", "FNO", "COM"], main: false },
  { id: "kotak", name: "Kotak Neo", vendor: "Kotak", color: "#0033a0", auth: "oauth", segments: ["EQ", "FNO"], main: false },
  { id: "fyers", name: "Fyers", vendor: "Fyers", color: "#111827", auth: "oauth", segments: ["EQ", "FNO"], main: false },
  { id: "paper", name: "Paper Trading", vendor: "T2S", color: "#2f54eb", auth: "none", segments: ["EQ", "FNO"], main: false },
];

const sampleBooks = {
  dhan: [
    { id: "d1", symbol: "SBIN", type: "BUY", qty: 40, avg: 798.5, ltp: 812.35, pnl: 554.0, brokerId: "dhan" },
    { id: "d2", symbol: "NIFTY 24500 CE", type: "BUY", qty: 65, avg: 128.4, ltp: 142.75, pnl: 1076.25, brokerId: "dhan" },
  ],
  zerodha: [
    { id: "z1", symbol: "RELIANCE", type: "BUY", qty: 20, avg: 2940.1, ltp: 2984.2, pnl: 882.0, brokerId: "zerodha" },
    { id: "z2", symbol: "BANKNIFTY 52100 PE", type: "SELL", qty: 30, avg: 178.2, ltp: 164.5, pnl: 411.0, brokerId: "zerodha" },
  ],
  kotak: [{ id: "k1", symbol: "HDFCBANK", type: "BUY", qty: 15, avg: 1658.0, ltp: 1672.4, pnl: 216.0, brokerId: "kotak" }],
  fyers: [{ id: "f1", symbol: "NIFTY 24600 CE", type: "BUY", qty: 65, avg: 74.1, ltp: 88.2, pnl: 916.5, brokerId: "fyers" }],
};

const connections = {
  dhan: {
    connected: true,
    clientId: "",
    funds: 0,
    marginUsed: 0,
    mode: "idle",
    keyHint: "",
    displayName: "Dhan",
    liveFeed: false,
  },
  paper: {
    connected: true,
    clientId: "PAPER-001",
    funds: 10_00_000,
    marginUsed: 12_000,
    mode: "paper",
    keyHint: "",
  },
};

let activeBrokerId = MAIN_BROKER_ID;

function publicAccount(meta) {
  const conn = connections[meta.id];
  const connected = Boolean(conn?.connected);
  return {
    ...meta,
    main: Boolean(meta.main),
    name: conn?.displayName || meta.name,
    connected,
    active: activeBrokerId === meta.id,
    mode: conn?.mode || (meta.id === "paper" ? "paper" : "sandbox"),
    clientId: connected ? conn.clientId : "",
    funds: connected ? conn.funds : 0,
    marginUsed: connected ? conn.marginUsed : 0,
    status: connected ? (conn.liveFeed ? "LIVE" : "CONNECTED") : "DISCONNECTED",
    keyHint: connected ? conn.keyHint || "" : "",
    liveFeed: Boolean(conn?.liveFeed),
  };
}

export function listBrokers() {
  return {
    activeBrokerId,
    mainBrokerId: MAIN_BROKER_ID,
    brokers: catalog.map(publicAccount),
  };
}

export function getActiveBroker() {
  const meta = catalog.find((item) => item.id === activeBrokerId) || catalog.find((item) => item.id === MAIN_BROKER_ID) || catalog[0];
  return publicAccount(meta);
}

export function connectBroker(id, payload = {}) {
  const meta = catalog.find((item) => item.id === id);
  if (!meta) return { error: "Unknown broker" };
  if (id === "paper") {
    connections.paper = { connected: true, clientId: "PAPER-001", funds: 10_00_000, marginUsed: 12_000, mode: "paper", keyHint: "" };
    return { ok: true, account: publicAccount(meta), positions: [] };
  }
  if (id === MAIN_BROKER_ID) {
    return { error: "Dhan live feed needs Client ID and Access Token from web.dhan.co." };
  }

  const clientId = String(payload.clientId || payload.userId || "").trim();
  const apiKey = String(payload.apiKey || payload.accessToken || "").trim();
  if (clientId.length < 3 || apiKey.length < 3) {
    return { error: "Enter client ID and API key. For sandbox use demo / demo123." };
  }

  connections[id] = {
    connected: true,
    clientId,
    funds: 2_50_000 + Math.round(Math.random() * 1_50_000),
    marginUsed: 18_000 + Math.round(Math.random() * 22_000),
    mode: "sandbox",
    keyHint: `••••${apiKey.slice(-4)}`,
  };
  return { ok: true, account: publicAccount(meta), positions: clone(sampleBooks[id] || []) };
}

export function markDhanLive({ clientId, funds, marginUsed, keyHint, displayName }) {
  connections.dhan = {
    connected: true,
    clientId: String(clientId || "").trim(),
    funds: Number(funds) || 0,
    marginUsed: Number(marginUsed) || 0,
    mode: "live",
    keyHint: keyHint || "",
    displayName: displayName || "Dhan",
    liveFeed: true,
  };
  activeBrokerId = MAIN_BROKER_ID;
  return publicAccount(catalog.find((item) => item.id === MAIN_BROKER_ID));
}

export function idleDhan() {
  connections.dhan = {
    connected: true,
    clientId: connections.dhan?.clientId || "",
    funds: connections.dhan?.funds || 0,
    marginUsed: connections.dhan?.marginUsed || 0,
    mode: "idle",
    keyHint: "",
    displayName: "Dhan",
    liveFeed: false,
  };
  return publicAccount(catalog.find((item) => item.id === MAIN_BROKER_ID));
}

export function disconnectBroker(id) {
  if (id === MAIN_BROKER_ID) {
    idleDhan();
    return { ok: true, stoppedLive: true, ...listBrokers() };
  }
  if (id === "paper") return { error: "Paper trading stays connected" };
  delete connections[id];
  if (activeBrokerId === id) activeBrokerId = MAIN_BROKER_ID;
  return { ok: true, ...listBrokers() };
}

export function activateBroker(id) {
  const meta = catalog.find((item) => item.id === id);
  if (!meta) return { error: "Unknown broker" };
  if (!connections[id]?.connected) return { error: "Connect this broker first" };
  activeBrokerId = id;
  return { ok: true, ...listBrokers() };
}

export function publicBrokers() {
  return listBrokers();
}
