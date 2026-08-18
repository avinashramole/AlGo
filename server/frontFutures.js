import { dropExpired, normalizeExpiry } from "./optionChain.js";

const SCRIP_MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
const CACHE_MS = 12 * 60 * 60 * 1000;

const UNDERLYINGS = [
  { parent: "NIFTY 50", root: "NIFTY", exchange: "NSE", segment: "NSE_FNO" },
  { parent: "BANKNIFTY", root: "BANKNIFTY", exchange: "NSE", segment: "NSE_FNO" },
  { parent: "FINNIFTY", root: "FINNIFTY", exchange: "NSE", segment: "NSE_FNO" },
  { parent: "SENSEX", root: "SENSEX", exchange: "BSE", segment: "BSE_FNO" },
];

const FALLBACK = [
  { parent: "NIFTY 50", symbol: "NIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58072 },
  { parent: "BANKNIFTY", symbol: "BANKNIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58067 },
  { parent: "FINNIFTY", symbol: "FINNIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58070 },
  { parent: "SENSEX", symbol: "SENSEX FUT", kind: "future", segment: "BSE_FNO", securityId: 825622 },
];

let cache = { at: 0, instruments: FALLBACK };

function splitCsvLine(line) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function pickFront(rows) {
  const sorted = [...rows].sort((a, b) => a.expiry.localeCompare(b.expiry));
  const live = sorted.filter((row) => dropExpired([row.expiry]).includes(row.expiry));
  return live[0] || sorted[0] || null;
}

export async function resolveFrontFutures() {
  if (Date.now() - cache.at < CACHE_MS && cache.instruments.length) return cache.instruments;
  try {
    const res = await fetch(SCRIP_MASTER_URL);
    if (!res.ok) throw new Error(`scrip master ${res.status}`);
    const text = await res.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const cols = splitCsvLine(lines[0] || "");
    const idx = Object.fromEntries(cols.map((col, i) => [col, i]));
    const grouped = Object.fromEntries(UNDERLYINGS.map((row) => [row.root, []]));

    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i].includes("FUTIDX")) continue;
      const parts = splitCsvLine(lines[i]);
      if (parts[idx.SEM_INSTRUMENT_NAME] !== "FUTIDX") continue;
      const trading = parts[idx.SEM_TRADING_SYMBOL] || "";
      const root = trading.split("-")[0];
      const und = UNDERLYINGS.find((row) => row.root === root && parts[idx.SEM_EXM_EXCH_ID] === row.exchange);
      if (!und) continue;
      const expiry = normalizeExpiry(parts[idx.SEM_EXPIRY_DATE]);
      const securityId = Number(parts[idx.SEM_SMST_SECURITY_ID]);
      if (!expiry || !Number.isFinite(securityId)) continue;
      grouped[root].push({ expiry, securityId, trading });
    }

    const instruments = UNDERLYINGS.map((und) => {
      const front = pickFront(grouped[und.root] || []);
      const fallback = FALLBACK.find((row) => row.parent === und.parent);
      if (!front) return fallback;
      return {
        parent: und.parent,
        symbol: `${und.root} FUT`,
        kind: "future",
        segment: und.segment,
        securityId: front.securityId,
        expiry: front.expiry,
      };
    }).filter(Boolean);

    if (instruments.length) {
      cache = { at: Date.now(), instruments };
      return instruments;
    }
  } catch {
    /* keep last known / fallback */
  }
  cache = { at: Date.now(), instruments: cache.instruments.length ? cache.instruments : FALLBACK };
  return cache.instruments;
}
