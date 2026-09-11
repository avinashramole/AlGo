import {
  connectLiveBroker,
  disconnectLiveBroker,
  isKnownLiveBroker,
  isLiveBrokerReady,
  listLiveBrokerPublic,
  liveBrokerMeta,
  liveBrokerPublic,
} from "./liveBrokers.js";

export const MAIN_BROKER_ID = "dhan";

export const catalog = [
  { id: "dhan", name: "Dhan", vendor: "Dhan", color: "#0f9d58", auth: "access_token", segments: ["EQ", "FNO"], main: true },
  { id: "zerodha", name: "Zerodha Kite", vendor: "Zerodha", color: "#f6461a", auth: "api_key", segments: ["EQ", "FNO", "COM"], main: false },
  { id: "upstox", name: "Upstox", vendor: "Upstox", color: "#5b2d8e", auth: "oauth", segments: ["EQ", "FNO"], main: false },
  { id: "kotak", name: "Kotak Neo", vendor: "Kotak", color: "#0033a0", auth: "oauth", segments: ["EQ", "FNO"], main: false },
  { id: "fyers", name: "Fyers", vendor: "Fyers", color: "#111827", auth: "oauth", segments: ["EQ", "FNO"], main: false },
  { id: "angelone", name: "Angel Broking", vendor: "Angel One", color: "#c2410c", auth: "api_key", segments: ["EQ", "FNO"], main: false },
  { id: "paper", name: "Paper Trading", vendor: "T2S", color: "#2f54eb", auth: "none", segments: ["EQ", "FNO"], main: false },
];

export const PAPER_STARTING_FUNDS = 10_00_000;

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
    clientId: "PAPER",
    funds: PAPER_STARTING_FUNDS,
    marginUsed: 0,
    mode: "paper",
    keyHint: "",
    virtual: true,
  },
};

let activeBrokerId = MAIN_BROKER_ID;

function hydrateSavedLiveBrokers() {
  for (const row of listLiveBrokerPublic()) {
    if (!row.live) continue;
    connections[row.id] = {
      connected: true,
      clientId: row.clientId,
      funds: row.funds,
      marginUsed: row.marginUsed,
      mode: "live",
      keyHint: row.keyHint,
      displayName: row.profileName || catalog.find((item) => item.id === row.id)?.name,
      liveFeed: true,
    };
  }
}

hydrateSavedLiveBrokers();

function publicAccount(meta) {
  const saved = meta.id !== "dhan" && meta.id !== "paper" ? liveBrokerPublic(meta.id) : null;
  const conn = connections[meta.id];
  const connected = Boolean(conn?.connected || saved?.live);
  const liveFeed = Boolean(conn?.liveFeed || saved?.live);
  return {
    ...meta,
    main: Boolean(meta.main),
    name: conn?.displayName || saved?.profileName || meta.name,
    connected,
    active: activeBrokerId === meta.id,
    mode: conn?.mode || (meta.id === "paper" ? "paper" : liveFeed ? "live" : "idle"),
    clientId: connected ? conn?.clientId || saved?.clientId || "" : "",
    funds: connected ? Number(conn?.funds || saved?.funds || 0) : 0,
    marginUsed: connected ? Number(conn?.marginUsed || saved?.marginUsed || 0) : 0,
    status: liveFeed ? "LIVE" : connected ? "CONNECTED" : "DISCONNECTED",
    keyHint: connected ? conn?.keyHint || saved?.keyHint || "" : "",
    liveFeed,
    virtual: meta.id === "paper" || Boolean(conn?.virtual),
    fields: liveBrokerMeta(meta.id)?.fields || [],
    help: liveBrokerMeta(meta.id)?.help || "",
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

export async function connectBroker(id, payload = {}, fetchImpl = fetch) {
  const meta = catalog.find((item) => item.id === id);
  if (!meta) return { error: "Unknown broker" };
  if (id === "paper") {
    connections.paper = {
      connected: true,
      clientId: "PAPER",
      funds: PAPER_STARTING_FUNDS,
      marginUsed: 0,
      mode: "paper",
      keyHint: "",
      virtual: true,
    };
    return { ok: true, account: publicAccount(meta), positions: [] };
  }
  if (id === MAIN_BROKER_ID) {
    return { error: "Dhan live feed needs Client ID and Access Token from web.dhan.co." };
  }
  if (!isKnownLiveBroker(id)) return { error: "Unknown live broker" };
  try {
    const live = await connectLiveBroker(id, payload, fetchImpl);
    connections[id] = {
      connected: true,
      clientId: live.clientId,
      funds: live.funds,
      marginUsed: live.marginUsed,
      mode: "live",
      keyHint: live.keyHint,
      displayName: live.profileName || meta.name,
      liveFeed: true,
    };
    return { ok: true, account: publicAccount(meta), positions: [] };
  } catch (error) {
    return { error: error.message || "Could not connect live broker" };
  }
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
  disconnectLiveBroker(id);
  delete connections[id];
  if (activeBrokerId === id) activeBrokerId = MAIN_BROKER_ID;
  return { ok: true, ...listBrokers() };
}

export function setPaperLedger({ funds, marginUsed } = {}) {
  const nextFunds = Number(funds);
  const nextMargin = Number(marginUsed);
  connections.paper = {
    ...connections.paper,
    connected: true,
    clientId: connections.paper?.clientId || "PAPER",
    funds: Number.isFinite(nextFunds) ? nextFunds : PAPER_STARTING_FUNDS,
    marginUsed: Number.isFinite(nextMargin) ? Math.max(0, nextMargin) : 0,
    mode: "paper",
    virtual: true,
    keyHint: "",
  };
  return publicAccount(catalog.find((item) => item.id === "paper"));
}

export function activateBroker(id) {
  const meta = catalog.find((item) => item.id === id);
  if (!meta) return { error: "Unknown broker" };
  if (!connections[id]?.connected && !isLiveBrokerReady(id) && id !== "paper") return { error: "Connect this broker first" };
  activeBrokerId = id;
  return { ok: true, ...listBrokers() };
}

export function publicBrokers() {
  return listBrokers();
}

export { isKnownLiveBroker, isLiveBrokerReady };
