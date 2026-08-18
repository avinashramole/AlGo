function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const catalog = [
  { id: "paper", name: "Paper Trading", vendor: "T2S", color: "#2f54eb", auth: "none", segments: ["EQ", "FNO"] },
  { id: "zerodha", name: "Zerodha Kite", vendor: "Zerodha", color: "#f6461a", auth: "api_key", segments: ["EQ", "FNO", "COM"] },
  { id: "upstox", name: "Upstox", vendor: "Upstox", color: "#5a2dff", auth: "oauth", segments: ["EQ", "FNO"] },
  { id: "angel", name: "Angel One", vendor: "Angel One", color: "#c41e3a", auth: "api_key", segments: ["EQ", "FNO", "COM"] },
  { id: "dhan", name: "Dhan", vendor: "Dhan", color: "#0f9d58", auth: "access_token", segments: ["EQ", "FNO"] },
  { id: "fyers", name: "Fyers", vendor: "Fyers", color: "#111827", auth: "oauth", segments: ["EQ", "FNO"] },
  { id: "groww", name: "Groww", vendor: "Groww", color: "#00b386", auth: "api_key", segments: ["EQ", "FNO"] },
  { id: "fivepaisa", name: "5Paisa", vendor: "5Paisa", color: "#00a651", auth: "api_key", segments: ["EQ", "FNO"] },
  { id: "icici", name: "ICICI Direct", vendor: "Breeze", color: "#f37a20", auth: "api_key", segments: ["EQ", "FNO"] },
  { id: "kotak", name: "Kotak Neo", vendor: "Kotak", color: "#0033a0", auth: "oauth", segments: ["EQ", "FNO"] },
];

const sampleBooks = {
  zerodha: [
    { id: "z1", symbol: "RELIANCE", type: "BUY", qty: 20, avg: 2940.1, ltp: 2984.2, pnl: 882.0, brokerId: "zerodha" },
    { id: "z2", symbol: "NIFTY 24500 CE", type: "BUY", qty: 50, avg: 136.4, ltp: 142.75, pnl: 317.5, brokerId: "zerodha" },
  ],
  upstox: [{ id: "u1", symbol: "HDFCBANK", type: "BUY", qty: 15, avg: 1658.0, ltp: 1672.4, pnl: 216.0, brokerId: "upstox" }],
  angel: [{ id: "g1", symbol: "BANKNIFTY 52100 PE", type: "SELL", qty: 15, avg: 178.2, ltp: 164.5, pnl: 205.5, brokerId: "angel" }],
  dhan: [{ id: "d1", symbol: "SBIN", type: "BUY", qty: 40, avg: 798.5, ltp: 812.35, pnl: 554.0, brokerId: "dhan" }],
};

const connections = {
  paper: {
    connected: true,
    clientId: "PAPER-001",
    funds: 10_00_000,
    marginUsed: 84_200,
    mode: "paper",
    keyHint: "",
  },
};

let activeBrokerId = "paper";

function publicAccount(meta) {
  const conn = connections[meta.id];
  const connected = Boolean(conn?.connected);
  return {
    ...meta,
    connected,
    active: activeBrokerId === meta.id,
    mode: conn?.mode || (meta.id === "paper" ? "paper" : "sandbox"),
    clientId: connected ? conn.clientId : "",
    funds: connected ? conn.funds : 0,
    marginUsed: connected ? conn.marginUsed : 0,
    status: connected ? "CONNECTED" : "DISCONNECTED",
    keyHint: connected ? conn.keyHint || "" : "",
  };
}

export function listBrokers() {
  return {
    activeBrokerId,
    brokers: catalog.map(publicAccount),
  };
}

export function getActiveBroker() {
  return catalog.find((item) => item.id === activeBrokerId) || catalog[0];
}

export function connectBroker(id, payload = {}) {
  const meta = catalog.find((item) => item.id === id);
  if (!meta) return { error: "Unknown broker" };
  if (id === "paper") {
    connections.paper = { connected: true, clientId: "PAPER-001", funds: 10_00_000, marginUsed: 84_200, mode: "paper", keyHint: "" };
    return { ok: true, account: publicAccount(meta), positions: [] };
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
  if (!activeBrokerId || activeBrokerId === "paper") {
    activeBrokerId = id;
  }
  return { ok: true, account: publicAccount(meta), positions: clone(sampleBooks[id] || []) };
}

export function disconnectBroker(id) {
  if (id === "paper") return { error: "Paper trading stays connected" };
  delete connections[id];
  if (activeBrokerId === id) activeBrokerId = "paper";
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
