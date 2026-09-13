import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = process.env.T2S_BROKER_SESSIONS_FILE || path.join(__dirname, "data", "broker-sessions.json");

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export const LIVE_BROKER_CATALOG = [
  {
    id: "dhan",
    name: "Dhan",
    vendor: "Dhan",
    color: "#0f9d58",
    auth: "access_token",
    segments: ["EQ", "FNO"],
    main: true,
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Dhan client ID" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "24-hour Access Token" },
    ],
    help: "Use Brokers → Dhan live feed. PIN + TOTP or paste the Access Token. Orders use DhanHQ POST /v2/orders.",
  },
  {
    id: "zerodha",
    name: "Zerodha Kite",
    vendor: "Zerodha",
    color: "#f6461a",
    auth: "api_key",
    segments: ["EQ", "FNO", "COM"],
    fields: [
      { id: "clientId", label: "User ID", placeholder: "Kite user id" },
      { id: "apiKey", label: "API key", placeholder: "Kite Connect API key" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "Daily Kite access token" },
    ],
    help: "Create an app on developers.kite.trade. Login once a day, then paste the access token. Orders use Kite POST /orders/regular.",
  },
  {
    id: "upstox",
    name: "Upstox",
    vendor: "Upstox",
    color: "#5b2d8e",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Upstox client id (optional)" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "Daily Upstox access token" },
    ],
    help: "Generate a daily token from the Upstox developer app. Orders use POST /v2/order/place.",
  },
  {
    id: "fyers",
    name: "Fyers",
    vendor: "Fyers",
    color: "#111827",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Fyers client id" },
      { id: "apiKey", label: "App ID", placeholder: "FYERS app id" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "FYERS access token" },
    ],
    help: "Create an app on myapi.fyers.in. Authorization is appId:accessToken. Orders use POST /api/v3/orders/sync.",
  },
  {
    id: "kotak",
    name: "Kotak Neo",
    vendor: "Kotak",
    color: "#0033a0",
    auth: "oauth",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client ID", placeholder: "Kotak client id" },
      { id: "apiKey", label: "Consumer key", placeholder: "Neo consumer key" },
      { id: "accessToken", label: "Access token", secret: true, placeholder: "Neo access token" },
      { id: "sessionToken", label: "Sid / session", secret: true, placeholder: "Neo sid (if required)" },
    ],
    help: "Use Kotak Neo developer credentials. Connect checks the Neo profile API, then live orders go to Neo place-order.",
  },
  {
    id: "angelone",
    name: "Angel Broking",
    vendor: "Angel One",
    color: "#c2410c",
    auth: "api_key",
    segments: ["EQ", "FNO"],
    fields: [
      { id: "clientId", label: "Client code", placeholder: "Angel client code" },
      { id: "apiKey", label: "API key", placeholder: "Angel SmartAPI key" },
      { id: "accessToken", label: "JWT token", secret: true, placeholder: "jwtToken from SmartAPI login" },
    ],
    help: "Login with SmartAPI (client code + PIN + TOTP) to get a jwtToken, then paste it here. Orders use Angel placeOrder.",
  },
];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function hintOf(value) {
  const raw = String(value || "");
  return raw.length >= 4 ? `••••${raw.slice(-4)}` : "";
}

function readSessions() {
  try {
    const row = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    return row && typeof row === "object" && !Array.isArray(row) ? row : {};
  } catch {
    return {};
  }
}

function writeSessions(store) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(store, null, 2)}\n`);
}

let sessions = readSessions();

function persist() {
  writeSessions(sessions);
}

export function liveBrokerMeta(id) {
  return LIVE_BROKER_CATALOG.find((row) => row.id === String(id || "").trim()) || null;
}

export function isKnownLiveBroker(id) {
  const wanted = String(id || "").trim();
  return Boolean(wanted && wanted !== "paper" && liveBrokerMeta(wanted));
}

export function isLiveBrokerReady(id) {
  const wanted = String(id || "").trim();
  if (wanted === "dhan") return false;
  const row = sessions[wanted];
  return Boolean(row?.accessToken);
}

export function liveBrokerPublic(id) {
  const meta = liveBrokerMeta(id);
  const row = sessions[id];
  if (!meta) return null;
  return {
    id: meta.id,
    name: meta.name,
    live: Boolean(row?.accessToken),
    clientId: row?.clientId || "",
    keyHint: row?.keyHint || "",
    funds: Number(row?.funds) || 0,
    marginUsed: Number(row?.marginUsed) || 0,
    profileName: row?.profileName || "",
    fields: meta.fields,
    help: meta.help,
  };
}

export function listLiveBrokerPublic() {
  return LIVE_BROKER_CATALOG.filter((row) => row.id !== "dhan").map((row) => liveBrokerPublic(row.id));
}

export function nfoTradingSymbol(symbol, expiry) {
  const raw = String(symbol || "").toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const named = raw.match(/^(NIFTY|BANKNIFTY|FINNIFTY|SENSEX)\s+(\d{3,6})\s*(CE|PE)$/);
  if (!named) {
    const compact = raw.replace(/\s+/g, "");
    return compact || raw;
  }
  const root = named[1];
  const strike = named[2];
  const opt = named[3];
  const ymd = String(expiry || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!ymd) return `${root}${strike}${opt}`;
  const yy = ymd[1].slice(-2);
  const mon = MONTHS[Number(ymd[2]) - 1] || "JAN";
  return `${root}${yy}${mon}${strike}${opt}`;
}

export function fyersSymbol(symbol, expiry) {
  const nfo = nfoTradingSymbol(symbol, expiry);
  if (nfo.includes(":")) return nfo;
  return `NSE:${nfo}`;
}

function jsonOf(res, text) {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: String(text || "").slice(0, 240) };
  }
}

async function httpJson(fetchImpl, url, options = {}) {
  const res = await fetchImpl(url, options);
  const text = await res.text();
  const body = jsonOf(res, text);
  if (!res.ok) {
    const message =
      body.message ||
      body.error ||
      body.emsg ||
      body.statusMessage ||
      body.data?.message ||
      `${res.status} ${res.statusText || "broker error"}`;
    throw fail(String(message), res.status === 401 ? 401 : 400);
  }
  return body;
}

function requiredToken(payload) {
  const accessToken = String(payload.accessToken || payload.apiKey || payload.jwtToken || "").trim();
  const apiKey = String(payload.apiKey || payload.appId || payload.consumerKey || "").trim();
  const clientId = String(payload.clientId || payload.userId || payload.clientCode || "").trim();
  const sessionToken = String(payload.sessionToken || payload.sid || "").trim();
  return { accessToken, apiKey, clientId, sessionToken };
}

async function probeZerodha(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Zerodha API key and daily access token.");
  }
  const body = await httpJson(fetchImpl, "https://api.kite.trade/user/profile", {
    headers: {
      "X-Kite-Version": "3",
      Authorization: `token ${creds.apiKey}:${creds.accessToken}`,
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.user_id || creds.clientId || ""),
    profileName: String(data.user_name || data.email || "Zerodha"),
    funds: 0,
  };
}

async function probeUpstox(fetchImpl, creds) {
  if (creds.accessToken.length < 8) throw fail("Enter the Upstox daily access token.");
  const body = await httpJson(fetchImpl, "https://api.upstox.com/v2/user/profile", {
    headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: "application/json" },
  });
  const data = body.data || body;
  return {
    clientId: String(data.user_id || data.email || creds.clientId || ""),
    profileName: String(data.user_name || data.email || "Upstox"),
    funds: 0,
  };
}

async function probeFyers(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Fyers App ID and access token.");
  }
  const body = await httpJson(fetchImpl, "https://api-t1.fyers.in/api/v3/profile", {
    headers: { Authorization: `${creds.apiKey}:${creds.accessToken}` },
  });
  const data = body.data || body;
  return {
    clientId: String(data.fy_id || data.display_name || creds.clientId || ""),
    profileName: String(data.name || data.display_name || "Fyers"),
    funds: 0,
  };
}

async function probeKotak(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 6) {
    throw fail("Enter Kotak Neo consumer key and access token.");
  }
  const body = await httpJson(fetchImpl, "https://gw-napi.kotaksecurities.com/Orders/2.0/quick/user/profile", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "neo-fin-key": creds.apiKey,
      sid: creds.sessionToken || "",
      Auth: creds.sessionToken || creds.accessToken,
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.clientId || data.client_id || creds.clientId || ""),
    profileName: String(data.name || data.clientName || "Kotak Neo"),
    funds: 0,
  };
}

async function probeAngel(fetchImpl, creds) {
  if (creds.apiKey.length < 4 || creds.accessToken.length < 8 || creds.clientId.length < 3) {
    throw fail("Enter Angel client code, API key, and jwtToken.");
  }
  const body = await httpJson(fetchImpl, "https://apiconnect.angelone.in/rest/secure/angelbroking/user/v1/getProfile", {
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "X-PrivateKey": creds.apiKey,
      "X-UserType": "USER",
      "X-SourceID": "WEB",
      "X-ClientLocalIP": "127.0.0.1",
      "X-ClientPublicIP": "127.0.0.1",
      "X-MACAddress": "00:00:00:00:00:00",
      "Content-Type": "application/json",
    },
  });
  const data = body.data || body;
  return {
    clientId: String(data.clientcode || creds.clientId),
    profileName: String(data.name || "Angel Broking"),
    funds: 0,
  };
}

const PROBES = {
  zerodha: probeZerodha,
  upstox: probeUpstox,
  fyers: probeFyers,
  kotak: probeKotak,
  angelone: probeAngel,
};

export async function connectLiveBroker(id, payload = {}, fetchImpl = fetch) {
  const meta = liveBrokerMeta(id);
  if (!meta || meta.id === "dhan") throw fail("Use the Dhan live-feed card for Dhan.");
  const creds = requiredToken(payload);
  const probe = PROBES[meta.id];
  if (!probe) throw fail("Unknown live broker.");
  const profile = await probe(fetchImpl, creds);
  sessions[meta.id] = {
    id: meta.id,
    clientId: profile.clientId || creds.clientId,
    apiKey: creds.apiKey,
    accessToken: creds.accessToken,
    sessionToken: creds.sessionToken,
    keyHint: hintOf(creds.accessToken || creds.apiKey),
    profileName: profile.profileName,
    funds: Number(profile.funds) || 0,
    marginUsed: 0,
    connectedAt: new Date().toISOString(),
  };
  persist();
  return liveBrokerPublic(meta.id);
}

export function disconnectLiveBroker(id) {
  const wanted = String(id || "").trim();
  if (!sessions[wanted]) return false;
  delete sessions[wanted];
  persist();
  return true;
}

export function liveBrokerSession(id) {
  return sessions[String(id || "").trim()] || null;
}

function orderQty(payload) {
  const qty = Math.abs(Number(payload.qty || payload.quantity || 0));
  if (!qty) throw fail("Order quantity is required.");
  return qty;
}

function orderSide(payload) {
  return String(payload.side || payload.transaction_type || "BUY").toUpperCase() === "SELL" ? "SELL" : "BUY";
}

export async function placeLiveBrokerOrder(id, payload = {}, fetchImpl = fetch) {
  const session = liveBrokerSession(id);
  if (!session?.accessToken) throw fail(`Connect ${liveBrokerMeta(id)?.name || id} on Brokers first.`);
  const qty = orderQty(payload);
  const side = orderSide(payload);
  const symbol = String(payload.symbol || "").trim();
  const expiry = payload.expiry || "";
  const nfo = nfoTradingSymbol(symbol, expiry);
  const product = String(payload.product || "MIS").toUpperCase();

  if (id === "zerodha") {
    const body = await httpJson(fetchImpl, "https://api.kite.trade/orders/regular", {
      method: "POST",
      headers: {
        "X-Kite-Version": "3",
        Authorization: `token ${session.apiKey}:${session.accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        tradingsymbol: nfo,
        exchange: /SENSEX/.test(nfo) ? "BFO" : "NFO",
        transaction_type: side,
        order_type: "MARKET",
        quantity: String(qty),
        product: product === "NRML" ? "NRML" : "MIS",
        validity: "DAY",
      }).toString(),
    });
    const orderId = String(body.data?.order_id || body.order_id || "");
    return { orderId, status: "PENDING", brokerId: "zerodha", tradingsymbol: nfo };
  }

  if (id === "upstox") {
    const instrument = String(payload.instrumentKey || payload.securityId || "").trim();
    if (!instrument) throw fail("Upstox live orders need an instrument key or security id.");
    const body = await httpJson(fetchImpl, "https://api.upstox.com/v2/order/place", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        quantity: qty,
        product: product === "NRML" ? "D" : "I",
        validity: "DAY",
        price: 0,
        instrument_token: instrument,
        order_type: "MARKET",
        transaction_type: side,
        disclosed_quantity: 0,
        trigger_price: 0,
        is_amo: false,
      }),
    });
    return { orderId: String(body.data?.order_id || body.order_id || ""), status: "PENDING", brokerId: "upstox" };
  }

  if (id === "fyers") {
    const body = await httpJson(fetchImpl, "https://api-t1.fyers.in/api/v3/orders/sync", {
      method: "POST",
      headers: {
        Authorization: `${session.apiKey}:${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        symbol: fyersSymbol(symbol, expiry),
        qty,
        type: 2,
        side: side === "SELL" ? -1 : 1,
        productType: product === "NRML" ? "MARGIN" : "INTRADAY",
        limitPrice: 0,
        stopPrice: 0,
        disclosedQty: 0,
        validity: "DAY",
        offlineOrder: false,
      }),
    });
    return { orderId: String(body.id || body.data?.id || ""), status: "PENDING", brokerId: "fyers" };
  }

  if (id === "kotak") {
    const body = await httpJson(fetchImpl, "https://gw-napi.kotaksecurities.com/Orders/2.0/quick/order/rule/ms/place", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "neo-fin-key": session.apiKey,
        sid: session.sessionToken || "",
        Auth: session.sessionToken || session.accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amo: "NO",
        exchange_segment: /SENSEX/.test(nfo) ? "bse_fo" : "nse_fo",
        product: product === "NRML" ? "NRML" : "MIS",
        price: "0",
        order_type: "MKT",
        quantity: String(qty),
        disclosed_quantity: "0",
        validity: "DAY",
        trading_symbol: nfo,
        transaction_type: side,
      }),
    });
    return { orderId: String(body.nOrdNo || body.data?.nOrdNo || body.orderId || ""), status: "PENDING", brokerId: "kotak" };
  }

  if (id === "angelone") {
    const token = String(payload.securityId || payload.symboltoken || "").trim();
    if (!token) throw fail("Angel live option orders need a symbol token / security id.");
    const body = await httpJson(fetchImpl, "https://apiconnect.angelone.in/rest/secure/angelbroking/order/v1/placeOrder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "X-PrivateKey": session.apiKey,
        "X-UserType": "USER",
        "X-SourceID": "WEB",
        "X-ClientLocalIP": "127.0.0.1",
        "X-ClientPublicIP": "127.0.0.1",
        "X-MACAddress": "00:00:00:00:00:00",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        variety: "NORMAL",
        tradingsymbol: nfo,
        symboltoken: token,
        transactiontype: side,
        exchange: /SENSEX/.test(nfo) ? "BFO" : "NFO",
        ordertype: "MARKET",
        producttype: product === "NRML" ? "CARRYFORWARD" : "INTRADAY",
        duration: "DAY",
        quantity: String(qty),
      }),
    });
    return { orderId: String(body.data?.orderid || body.orderid || ""), status: "PENDING", brokerId: "angelone" };
  }

  throw fail("Unknown live broker.");
}
