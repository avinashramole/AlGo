import { liveBrokerSession } from "./liveBrokers.js";
import { brokerNeedsApiKey, fetchMemberBrokerQuotes, supportedMemberQuoteBroker } from "./memberBrokerQuotes.js";
import { memberIndexQuote } from "./market.js";
import { peekClientSecrets } from "./memberDesk.js";
import { dayChangeFromQuote } from "./quoteDayChange.js";

export { dayChangeFromQuote };

const CACHE_MS = 4_000;
const cache = new Map();
const sparks = new Map();
const prevCloses = new Map();
const inflight = new Map();

const CARDS = [
  { symbol: "NIFTY 50", name: "NIFTY", keys: ["NIFTY 50", "NIFTY", "NIFTY FUT"], lot: 65 },
  { symbol: "BANKNIFTY", name: "BANKNIFTY", keys: ["BANKNIFTY", "BANK NIFTY", "BANKNIFTY FUT"], lot: 30 },
  { symbol: "FINNIFTY", name: "FINNIFTY", keys: ["FINNIFTY", "FINNIFTY FUT"], lot: 60 },
  { symbol: "SENSEX", name: "SENSEX", keys: ["SENSEX", "SENSEX FUT"], lot: 20 },
  { symbol: "CRUDEOIL", name: "CRUDE OIL", keys: ["CRUDEOIL", "CRUDE OIL", "CRUDEOIL FUT"], lot: 100 },
  { symbol: "INDIA VIX", name: "VIX", keys: ["INDIA VIX", "INDIAVIX", "VIX"], lot: 0 },
];

const BROKER_NAMES = {
  dhan: "DHAN",
  upstox: "UPSTOX",
  zerodha: "ZERODHA",
  fyers: "FYERS",
  kotak: "KOTAK",
  angelone: "ANGEL",
  paper: "PAPER",
};

function brokerNameOf(brokerId) {
  return BROKER_NAMES[String(brokerId || "").toLowerCase()] || String(brokerId || "").toUpperCase();
}

function round2(value) {
  return Number(Number(value).toFixed(2));
}

function pushSpark(list, price) {
  const next = [...(Array.isArray(list) ? list : []), round2(price)].filter((item) => item > 0);
  return next.slice(-8);
}

function matchesCard(quote, card) {
  const keys = new Set(card.keys);
  return keys.has(String(quote.parent || "")) || keys.has(String(quote.symbol || ""));
}

export function cardsFromMemberQuotes(userId, quotes = []) {
  const sparkMap = sparks.get(userId) || {};
  const prevMap = prevCloses.get(userId) || {};
  const rows = CARDS.map((card) => {
    const indexQuote = quotes.find((row) => row.kind !== "future" && matchesCard(row, card));
    const futureQuote = quotes.find((row) => row.kind === "future" && matchesCard(row, card));
    const priceRaw = Number(indexQuote?.ltp || (card.symbol === "CRUDEOIL" ? futureQuote?.ltp : 0));
    const futureRaw = Number(futureQuote?.ltp || 0);
    const price = priceRaw > 0 ? priceRaw : futureRaw;
    const day = dayChangeFromQuote(price, indexQuote || futureQuote || {}, prevMap[card.symbol]);
    if (day.prevClose > 0) prevMap[card.symbol] = day.prevClose;
    if (price > 0) sparkMap[card.symbol] = pushSpark(sparkMap[card.symbol], price);
    return memberIndexQuote({
      symbol: card.symbol,
      name: card.name,
      price: price > 0 ? round2(price) : 0,
      change: day.change,
      changePct: day.changePct,
      prevClose: day.prevClose,
      spark: sparkMap[card.symbol] || [],
      future: futureRaw > 0 ? round2(futureRaw) : price > 0 ? round2(price) : 0,
      futureExpiry: futureQuote?.expiry || "",
      lot: card.lot,
    });
  });
  sparks.set(userId, sparkMap);
  prevCloses.set(userId, prevMap);
  return rows;
}

function emptyQuotes(brokerId, reason) {
  return {
    indices: [],
    source: "member",
    brokerId: brokerId || "paper",
    brokerName: brokerNameOf(brokerId || "paper"),
    live: false,
    lastTickAt: null,
    reason,
  };
}

function kotakTotpSecret(deskKotak) {
  return String(process.env.T2S_KOTAK_TOTP_SECRET || deskKotak?.totpSecret || "").trim();
}

function kotakFeedCreds(secrets, deskKotak) {
  const totpSecret = kotakTotpSecret(deskKotak);
  const ownReady = Boolean(secrets.credentialsInstalled && secrets.brokerToken && secrets.accountId && secrets.brokerApiKey);
  if (ownReady) {
    return {
      brokerId: "kotak",
      accessToken: String(secrets.brokerToken).trim(),
      clientId: String(secrets.accountId).trim(),
      apiKey: String(secrets.brokerApiKey).trim(),
      sessionToken: String(secrets.brokerSessionToken || "").trim(),
      totpSecret,
    };
  }
  const envKey = String(process.env.T2S_KOTAK_CONSUMER_KEY || "").trim();
  const envToken = String(process.env.T2S_KOTAK_ACCESS_TOKEN || envKey).trim();
  if (envKey || envToken) {
    return {
      brokerId: "kotak",
      accessToken: envToken || envKey,
      clientId: String(process.env.T2S_KOTAK_CLIENT_ID || "").trim(),
      apiKey: envKey || envToken,
      sessionToken: "",
      totpSecret,
    };
  }
  const session = deskKotak === null ? null : deskKotak || liveBrokerSession("kotak");
  const apiKey = String(session?.apiKey || "").trim();
  const accessToken = String(session?.accessToken || apiKey).trim();
  if (!apiKey && !accessToken) return null;
  return {
    brokerId: "kotak",
    accessToken,
    clientId: String(session?.clientId || "").trim(),
    apiKey: apiKey || accessToken,
    sessionToken: String(session?.sessionToken || "").trim(),
    totpSecret,
  };
}

function kotakQuoteBoard(now, { live = false, indices = [], reason = "" } = {}) {
  return {
    indices,
    source: "kotak",
    brokerId: "kotak",
    brokerName: brokerNameOf("kotak"),
    live,
    lastTickAt: live ? now : null,
    reason,
  };
}

async function kotakLiveBoard(user, secrets, { fetchQuotes, deskKotak, now }) {
  const creds = kotakFeedCreds(secrets, deskKotak);
  if (!creds) {
    return kotakQuoteBoard(now, {
      reason: "Index quotes use this user's Kotak Neo key. Add it on the server, then the Kotak feed fills in.",
    });
  }
  const hit = cache.get(user.id);
  if (hit && now - hit.at < CACHE_MS) return hit.payload;
  const pending = inflight.get(user.id);
  if (pending) return pending;
  const job = (async () => {
    let quotes = [];
    try {
      quotes = await (typeof fetchQuotes === "function" ? fetchQuotes(creds) : fetchMemberBrokerQuotes(creds));
    } catch {
      quotes = [];
    }
    if (!quotes.length) {
      return kotakQuoteBoard(now, { reason: "Kotak Neo did not return index quotes yet." });
    }
    const payload = {
      indices: cardsFromMemberQuotes(user.id, quotes),
      source: "kotak",
      brokerId: "kotak",
      brokerName: brokerNameOf("kotak"),
      live: true,
      lastTickAt: now,
      reason: "",
    };
    cache.set(user.id, { at: now, payload });
    return payload;
  })();
  inflight.set(user.id, job);
  try {
    return await job;
  } finally {
    inflight.delete(user.id);
  }
}

export async function memberQuotesForUser(user, { fetchQuotes, deskKotak, now = Date.now() } = {}) {
  if (!user?.id) return emptyQuotes("paper", "Sign in first.");
  const secrets = peekClientSecrets(user.id);
  const brokerId = String(secrets.brokerId || "paper").trim().toLowerCase() || "paper";
  const token = String(secrets.brokerToken || "").trim();
  const accountId = String(secrets.accountId || "").trim();
  const apiKey = String(secrets.brokerApiKey || "").trim();
  if (brokerId === "kotak") {
    return kotakLiveBoard(user, secrets, { fetchQuotes, deskKotak, now });
  }
  if (brokerId === "paper" || secrets.tradeMode !== "real" || !token || !accountId) {
    return emptyQuotes(
      brokerId,
      "Install your broker client ID and access token on My plan. Index quotes use your token, not the desk token.",
    );
  }
  if (!supportedMemberQuoteBroker(brokerId)) {
    return emptyQuotes(
      brokerId,
      `Your selected broker is ${brokerId}. Index cards are wired for Dhan, Upstox, Zerodha, Fyers, and Angel — install that broker token on My plan.`,
    );
  }
  if (brokerNeedsApiKey(brokerId) && !apiKey) {
    return emptyQuotes(brokerId, `Install your ${brokerId} API key and access token on My plan. Index cards use your token, not the desk token.`);
  }
  const hit = cache.get(user.id);
  if (hit && now - hit.at < CACHE_MS) return hit.payload;
  const pending = inflight.get(user.id);
  if (pending) return pending;
  const creds = { brokerId, accessToken: token, clientId: accountId, apiKey };
  const job = (async () => {
    let quotes = [];
    try {
      quotes = await (typeof fetchQuotes === "function" ? fetchQuotes(creds) : fetchMemberBrokerQuotes(creds));
    } catch {
      quotes = [];
    }
    const payload = {
      indices: cardsFromMemberQuotes(user.id, quotes),
      source: "member",
      brokerId,
      brokerName: brokerNameOf(brokerId),
      live: quotes.length > 0,
      lastTickAt: quotes.length ? now : null,
      reason: quotes.length
        ? ""
        : `Your ${brokerId} token did not return index quotes yet. Check the token on My plan.`,
    };
    cache.set(user.id, { at: now, payload });
    return payload;
  })();
  inflight.set(user.id, job);
  try {
    return await job;
  } finally {
    inflight.delete(user.id);
  }
}
