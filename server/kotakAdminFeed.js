import { fetchMemberBrokerQuotes } from "./memberBrokerQuotes.js";
import { adminQuoteFeed, applyLiveQuotes, setDhanFeed } from "./market.js";

export function kotakAdminQuoteKey() {
  return String(process.env.T2S_KOTAK_CONSUMER_KEY || process.env.T2S_KOTAK_ACCESS_TOKEN || "").trim();
}

export function dhanOwnsAdminTape(feed = {}) {
  return Boolean(feed.live) && (feed.source === "websocket" || feed.source === "rest");
}

export async function pullKotakAdminQuotes({
  key = kotakAdminQuoteKey(),
  feed = {},
  fetchQuotes = fetchMemberBrokerQuotes,
  applyQuotes = applyLiveQuotes,
  now = Date.now(),
} = {}) {
  if (!key) return { ok: false, reason: "no-key", patch: null };
  if (dhanOwnsAdminTape(feed)) return { ok: false, reason: "dhan-live", patch: null };
  let quotes = [];
  try {
    quotes = await fetchQuotes({ brokerId: "kotak", apiKey: key, accessToken: key });
  } catch {
    quotes = [];
  }
  if (!Array.isArray(quotes) || !quotes.length) {
    return {
      ok: false,
      reason: "empty",
      patch: { live: false, source: "kotak", error: "Kotak Neo did not return index quotes.", quoteCount: 0 },
    };
  }
  applyQuotes(quotes);
  return {
    ok: true,
    reason: "",
    patch: { live: true, source: "kotak", error: null, lastTickAt: now, quoteCount: quotes.length },
  };
}

let started = false;
let announced = false;

export function startKotakAdminQuoteFeed() {
  if (started) return;
  if (process.execArgv.includes("--test") || process.argv.includes("--test")) return;
  started = true;
  const tick = async () => {
    try {
      const result = await pullKotakAdminQuotes({ feed: adminQuoteFeed() });
      if (result.patch) setDhanFeed(result.patch);
      if (result.ok && !announced) {
        announced = true;
        console.log("Kotak index feed started. Order LIVE stays off.");
      }
    } catch (error) {
      console.error(`Kotak index feed failed: ${error.message || error}`);
    }
  };
  void tick();
  setInterval(() => {
    void tick();
  }, 4_000);
}
