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

export async function memberQuotesForUser(user, { fetchQuotes, now = Date.now() } = {}) {
  if (!user?.id) return emptyQuotes("paper", "Sign in first.");
  const secrets = peekClientSecrets(user.id);
  const brokerId = String(secrets.brokerId || "paper").trim().toLowerCase() || "paper";
  const token = String(secrets.brokerToken || "").trim();
  const accountId = String(secrets.accountId || "").trim();
  const apiKey = String(secrets.brokerApiKey || "").trim();
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
