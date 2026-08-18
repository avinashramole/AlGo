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

const ROOTS = new Set(UNDERLYINGS.map((row) => row.root));

let cache = { at: 0, instruments: FALLBACK, options: new Map() };
let loading = null;

function splitCsvLine(line) {
  return line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
}

function pickFront(rows) {
  const sorted = [...rows].sort((a, b) => a.expiry.localeCompare(b.expiry));
  const live = sorted.filter((row) => dropExpired([row.expiry]).includes(row.expiry));
  return live[0] || sorted[0] || null;
}

export function optionRoot(symbol) {
  const raw = String(symbol || "").toUpperCase().replace(/,/g, " ");
  if (raw.includes("BANKNIFTY") || raw.includes("BANK NIFTY")) return "BANKNIFTY";
  if (raw.includes("FINNIFTY")) return "FINNIFTY";
  if (raw.includes("SENSEX")) return "SENSEX";
  if (raw.includes("NIFTY")) return "NIFTY";
  return raw.trim().split(/\s+/)[0] || "";
}

export function parseOptionContract(symbol) {
  const clean = String(symbol || "").replace(/,/g, "").toUpperCase();
  const match = clean.match(/\b(BANKNIFTY|FINNIFTY|SENSEX|NIFTY)\s+(\d+(?:\.\d+)?)\s+(CE|PE)\b/);
  if (!match) return null;
  return { root: match[1], strike: Number(match[2]), option: match[3] };
}

function optionKey(root, expiry, strike, option) {
  return `${optionRoot(root)}|${normalizeExpiry(expiry)}|${Number(strike)}|${String(option || "").toUpperCase()}`;
}

async function loadScripMaster() {
  if (cache.at && Date.now() - cache.at < CACHE_MS) return cache;
  if (loading) return loading;

  loading = (async () => {
    try {
      const res = await fetch(SCRIP_MASTER_URL);
      if (!res.ok) throw new Error(`scrip master ${res.status}`);
      const text = await res.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const cols = splitCsvLine(lines[0] || "");
      const idx = Object.fromEntries(cols.map((col, i) => [col, i]));
      const grouped = Object.fromEntries(UNDERLYINGS.map((row) => [row.root, []]));
      const options = new Map();

      for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i];
        const isFut = line.includes("FUTIDX");
        const isOpt = line.includes("OPTIDX");
        if (!isFut && !isOpt) continue;
        const parts = splitCsvLine(line);
        const instrument = parts[idx.SEM_INSTRUMENT_NAME];
        const trading = parts[idx.SEM_TRADING_SYMBOL] || "";
        const root = trading.split("-")[0];
        const und = UNDERLYINGS.find((row) => row.root === root && parts[idx.SEM_EXM_EXCH_ID] === row.exchange);
        if (!und || !ROOTS.has(root)) continue;
        const expiry = normalizeExpiry(parts[idx.SEM_EXPIRY_DATE]);
        const securityId = Number(parts[idx.SEM_SMST_SECURITY_ID]);
        if (!expiry || !Number.isFinite(securityId) || securityId <= 0) continue;
        if (instrument === "FUTIDX") {
          grouped[root].push({ expiry, securityId, trading });
        } else if (instrument === "OPTIDX") {
          const option = String(parts[idx.SEM_OPTION_TYPE] || "").toUpperCase();
          const strike = Number(parts[idx.SEM_STRIKE_PRICE]);
          if ((option === "CE" || option === "PE") && Number.isFinite(strike)) {
            options.set(optionKey(root, expiry, strike, option), String(securityId));
          }
        }
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

      cache = {
        at: Date.now(),
        instruments: instruments.length ? instruments : FALLBACK,
        options,
      };
      return cache;
    } catch {
      cache = {
        at: Date.now(),
        instruments: cache.instruments.length ? cache.instruments : FALLBACK,
        options: cache.options instanceof Map ? cache.options : new Map(),
      };
      return cache;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

export async function resolveFrontFutures() {
  const data = await loadScripMaster();
  return data.instruments;
}

export async function lookupOptionSecurityId({ symbol, expiry, strike, option } = {}) {
  const parsed = parseOptionContract(symbol);
  const root = optionRoot(symbol || parsed?.root);
  const opt = String(option || parsed?.option || "").toUpperCase();
  const px = Number(strike || parsed?.strike || 0);
  const exp = normalizeExpiry(expiry);
  if (!root || !opt || !px || !exp) return "";
  const data = await loadScripMaster();
  return data.options.get(optionKey(root, exp, px, opt)) || "";
}

export function enrichOptionRows(rows, { symbol, expiry } = {}) {
  if (!Array.isArray(rows) || !cache.options.size) return rows || [];
  const root = optionRoot(symbol);
  const exp = normalizeExpiry(expiry);
  return rows.map((row) => {
    const callId = Number(row.callId || cache.options.get(optionKey(root, exp, row.strike, "CE")) || 0) || undefined;
    const putId = Number(row.putId || cache.options.get(optionKey(root, exp, row.strike, "PE")) || 0) || undefined;
    return { ...row, callId, putId };
  });
}
