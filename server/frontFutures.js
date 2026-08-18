import { buildSyntheticChain, dropExpired, markAtmRows, normalizeExpiry, trimAroundAtm } from "./optionChain.js";

const SCRIP_MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master.csv";
const CACHE_MS = 12 * 60 * 60 * 1000;

const UNDERLYINGS = [
  { parent: "NIFTY 50", root: "NIFTY", exchange: "NSE", segment: "NSE_FNO", lot: 65, indexId: 13, indexSegment: "IDX_I" },
  { parent: "BANKNIFTY", root: "BANKNIFTY", exchange: "NSE", segment: "NSE_FNO", lot: 30, indexId: 25, indexSegment: "IDX_I" },
  { parent: "FINNIFTY", root: "FINNIFTY", exchange: "NSE", segment: "NSE_FNO", lot: 60, indexId: 27, indexSegment: "IDX_I" },
  { parent: "SENSEX", root: "SENSEX", exchange: "BSE", segment: "BSE_FNO", lot: 20, indexId: 51, indexSegment: "IDX_I" },
];

const FALLBACK = [
  { parent: "NIFTY 50", symbol: "NIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58072 },
  { parent: "BANKNIFTY", symbol: "BANKNIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58067 },
  { parent: "FINNIFTY", symbol: "FINNIFTY FUT", kind: "future", segment: "NSE_FNO", securityId: 58070 },
  { parent: "SENSEX", symbol: "SENSEX FUT", kind: "future", segment: "BSE_FNO", securityId: 825622 },
];

const ROOTS = new Set(UNDERLYINGS.map((row) => row.root));

let cache = { at: 0, instruments: FALLBACK, options: new Map(), byExpiry: new Map(), futures: {} };
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

function expiryKey(root, expiry) {
  return `${optionRoot(root)}|${normalizeExpiry(expiry)}`;
}

function strikeBucket(byExpiry, root, expiry, strike) {
  const key = expiryKey(root, expiry);
  if (!byExpiry.has(key)) byExpiry.set(key, new Map());
  const strikes = byExpiry.get(key);
  if (!strikes.has(strike)) strikes.set(strike, {});
  return strikes.get(strike);
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
      const byExpiry = new Map();

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
          grouped[root].push({
            expiry,
            securityId,
            trading,
            lot: Number(parts[idx.SEM_LOT_UNITS]) || und.lot,
            segment: und.segment,
          });
        } else if (instrument === "OPTIDX") {
          const option = String(parts[idx.SEM_OPTION_TYPE] || "").toUpperCase();
          const strike = Number(parts[idx.SEM_STRIKE_PRICE]);
          if ((option === "CE" || option === "PE") && Number.isFinite(strike)) {
            options.set(optionKey(root, expiry, strike, option), String(securityId));
            const ids = strikeBucket(byExpiry, root, expiry, strike);
            if (option === "CE") ids.callId = securityId;
            else ids.putId = securityId;
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
        byExpiry,
        futures: grouped,
      };
      return cache;
    } catch {
      cache = {
        at: Date.now(),
        instruments: cache.instruments.length ? cache.instruments : FALLBACK,
        options: cache.options instanceof Map ? cache.options : new Map(),
        byExpiry: cache.byExpiry instanceof Map ? cache.byExpiry : new Map(),
        futures: cache.futures || {},
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

export async function lookupFutureSecurityId({ symbol, expiry } = {}) {
  const root = optionRoot(symbol);
  if (!root) return "";
  const data = await loadScripMaster();
  const rows = [...(data.futures?.[root] || [])].sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
  const wanted = normalizeExpiry(expiry);
  const live = rows.filter((row) => dropExpired([row.expiry]).includes(row.expiry));
  const match = wanted ? rows.find((row) => row.expiry === wanted) : live[0] || rows[0];
  return match ? String(match.securityId) : "";
}

export function listFutures() {
  const out = [];
  for (const und of UNDERLYINGS) {
    const rows = [...(cache.futures?.[und.root] || [])].sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    const live = rows.filter((row) => row.expiry && dropExpired([row.expiry]).includes(row.expiry));
    const usable = live.length ? live : rows;
    const front = usable[0];
    for (const row of usable) {
      out.push({
        root: und.root,
        parent: und.parent,
        symbol: `${und.root} FUT`,
        name: row.expiry ? `${und.root} FUT ${row.expiry}` : `${und.root} FUT`,
        kind: "future",
        expiry: row.expiry || "",
        securityId: String(row.securityId),
        segment: row.segment || und.segment,
        lot: Number(row.lot) || und.lot,
        qty: Number(row.lot) || und.lot,
        front: Boolean(front && row.securityId === front.securityId),
        tradable: true,
      });
    }
  }
  return out;
}

export function listIndexContracts() {
  return UNDERLYINGS.map((und) => ({
    root: und.root,
    parent: und.parent,
    symbol: und.parent,
    kind: "index",
    securityId: String(und.indexId),
    segment: und.indexSegment,
    lot: und.lot,
    tradable: false,
    note: "Quotes only. Trade the future or options.",
  }));
}

export function attachContractIds(indices) {
  const futs = listFutures();
  return (indices || []).map((item) => {
    const root = optionRoot(item.symbol);
    const und = UNDERLYINGS.find((row) => row.root === root || row.parent === item.symbol);
    const front = futs.find((row) => row.root === root && row.front);
    return {
      ...item,
      securityId: item.securityId || und?.indexId,
      indexId: und?.indexId || item.securityId,
      futureId: item.futureId || front?.securityId,
      futureExpiry: item.futureExpiry || front?.expiry,
      futureSegment: item.futureSegment || front?.segment,
      lot: item.lot || front?.lot || und?.lot,
    };
  });
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

export function scripExpiries(symbol) {
  const root = optionRoot(symbol);
  const prefix = `${root}|`;
  const dates = [];
  for (const key of cache.byExpiry.keys()) {
    if (key.startsWith(prefix)) dates.push(key.slice(prefix.length));
  }
  return dropExpired([...new Set(dates)].sort());
}

export function buildScripChain({ symbol, expiry, spot, step = 50, liveRows = [], wings = 12 } = {}) {
  const root = optionRoot(symbol);
  const exp = normalizeExpiry(expiry);
  const bucket = cache.byExpiry.get(expiryKey(root, exp));
  const liveMap = new Map((liveRows || []).map((row) => [Number(row.strike), row]));
  const synthMap = new Map(
    buildSyntheticChain(spot || 0, step, 16).map((row) => [Number(row.strike), row]),
  );
  const strikes = new Set([...(bucket ? bucket.keys() : []), ...liveMap.keys()]);
  if (!strikes.size) {
    return enrichOptionRows(liveRows || [], { symbol, expiry });
  }
  const hasLive = (liveRows || []).some((row) => Number(row.callLtp) > 0 || Number(row.putLtp) > 0);
  const rows = [...strikes]
    .filter((strike) => Number.isFinite(Number(strike)))
    .sort((a, b) => a - b)
    .map((strike) => {
      const live = liveMap.get(Number(strike)) || {};
      const ids = bucket?.get(Number(strike)) || {};
      const synth = synthMap.get(Number(strike)) || {};
      const callId = Number(live.callId || ids.callId || 0) || undefined;
      const putId = Number(live.putId || ids.putId || 0) || undefined;
      return {
        strike: Number(strike),
        callLtp: hasLive ? Number(live.callLtp || 0) : Number(live.callLtp || synth.callLtp || 0),
        callChg: Number(live.callChg || synth.callChg || 0),
        callOi: Number(live.callOi || synth.callOi || 0),
        callOiChg: Number(live.callOiChg || synth.callOiChg || 0),
        callVol: Number(live.callVol || synth.callVol || 0),
        callIv: Number(live.callIv || synth.callIv || 0),
        callDelta: Number(live.callDelta || synth.callDelta || 0),
        callBid: Number(live.callBid || 0),
        callAsk: Number(live.callAsk || 0),
        callId,
        putLtp: hasLive ? Number(live.putLtp || 0) : Number(live.putLtp || synth.putLtp || 0),
        putChg: Number(live.putChg || synth.putChg || 0),
        putOi: Number(live.putOi || synth.putOi || 0),
        putOiChg: Number(live.putOiChg || synth.putOiChg || 0),
        putVol: Number(live.putVol || synth.putVol || 0),
        putIv: Number(live.putIv || synth.putIv || 0),
        putDelta: Number(live.putDelta || synth.putDelta || 0),
        putBid: Number(live.putBid || 0),
        putAsk: Number(live.putAsk || 0),
        putId,
        atm: Boolean(live.atm),
      };
    });
  return trimAroundAtm(markAtmRows(rows, spot, step), wings);
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
