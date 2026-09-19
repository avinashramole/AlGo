import { fetchDhanTapeQuotes } from "./dhan.js";
import { memberIndexQuote } from "./market.js";
import { peekClientSecrets } from "./memberDesk.js";

const CACHE_MS = 4_000;
const cache = new Map();
const sparks = new Map();

const CARDS = [
  { symbol: "NIFTY 50", name: "NIFTY", keys: ["NIFTY 50", "NIFTY", "NIFTY FUT"], lot: 65 },
  { symbol: "BANKNIFTY", name: "BANKNIFTY", keys: ["BANKNIFTY", "BANK NIFTY", "BANKNIFTY FUT"], lot: 30 },
  { symbol: "FINNIFTY", name: "FINNIFTY", keys: ["FINNIFTY", "FINNIFTY FUT"], lot: 60 },
  { symbol: "SENSEX", name: "SENSEX", keys: ["SENSEX", "SENSEX FUT"], lot: 20 },
  { symbol: "CRUDEOIL", name: "CRUDE OIL", keys: ["CRUDEOIL", "CRUDE OIL", "CRUDEOIL FUT"], lot: 100 },
];

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
  const rows = CARDS.map((card) => {
    const indexQuote = quotes.find((row) => row.kind !== "future" && matchesCard(row, card));
    const futureQuote = quotes.find((row) => row.kind === "future" && matchesCard(row, card));
    const priceRaw = Number(indexQuote?.ltp || (card.symbol === "CRUDEOIL" ? futureQuote?.ltp : 0));
    const futureRaw = Number(futureQuote?.ltp || 0);
    const close = Number(indexQuote?.close || futureQuote?.close || 0);
    const price = priceRaw > 0 ? priceRaw : futureRaw;
    if (!(price > 0)) return null;
    const prev = close > 0 && close !== price ? close : price;
    const change = round2(price - prev);
    const changePct = prev ? round2((change / prev) * 100) : 0;
    sparkMap[card.symbol] = pushSpark(sparkMap[card.symbol], price);
    return memberIndexQuote({
      symbol: card.symbol,
      name: card.name,
      price: round2(price),
      change,
      changePct,
      spark: sparkMap[card.symbol],
      future: futureRaw > 0 ? round2(futureRaw) : round2(price),
      futureExpiry: futureQuote?.expiry || "",
      lot: card.lot,
    });
  }).filter(Boolean);
  sparks.set(userId, sparkMap);
  return rows;
}

function emptyQuotes(brokerId, reason) {
  return {
    indices: [],
    source: "member",
    brokerId: brokerId || "paper",
    reason,
  };
}

export async function memberQuotesForUser(user, { fetchQuotes, now = Date.now() } = {}) {
  if (!user?.id) return emptyQuotes("paper", "Sign in first.");
  const secrets = peekClientSecrets(user.id);
  const brokerId = String(secrets.brokerId || "paper").trim().toLowerCase() || "paper";
  const token = String(secrets.brokerToken || "").trim();
  const accountId = String(secrets.accountId || "").trim();
  if (brokerId === "paper" || secrets.tradeMode !== "real" || !token || !accountId) {
    return emptyQuotes(
      brokerId,
      "Install your broker client ID and access token on My plan. Index quotes use your token, not the desk token.",
    );
  }
  if (brokerId !== "dhan") {
    return emptyQuotes(
      brokerId,
      `Your selected broker is ${brokerId}. Index cards pull live LTP with a Dhan token — select DHAN and install your access token.`,
    );
  }
  const hit = cache.get(user.id);
  if (hit && now - hit.at < CACHE_MS) return hit.payload;
  let quotes = [];
  try {
    quotes = await (typeof fetchQuotes === "function"
      ? fetchQuotes({ accessToken: token, clientId: accountId })
      : fetchDhanTapeQuotes({ accessToken: token, clientId: accountId }));
  } catch {
    quotes = [];
  }
  const payload = {
    indices: cardsFromMemberQuotes(user.id, quotes),
    source: "member",
    brokerId: "dhan",
    reason: quotes.length
      ? ""
      : "Your Dhan token did not return index quotes yet. Check the token on My plan.",
  };
  cache.set(user.id, { at: now, payload });
  return payload;
}
