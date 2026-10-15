const TRAIL_RE = /trail|trailing[\s-]?sl/;
const SL_RE = /\bsl\b|stop[\s-]?loss|sl hit|hit stop/;
const TGT_RE = /\btgt\b|target|tgt done|primary-target|combined-target|initial-target/;
const BROKER_FAIL_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/;
const BROKER_NOISE_RE =
  /trade confirmed|sent to dhan|sent to kotak|not sent to dhan|desk demo|oms success|order placed|order traded|^traded$|^success$|^ok$|^submitted$|desk fill at ltp|paper fill at live ltp/;
const CONTRACT_RE =
  /\b(MIDCPNIFTY|BANKNIFTY|FINNIFTY|SENSEX|CRUDEOIL|NATURALGAS|COPPER|NIFTY|CRUDE)\b.*?\b(\d{3,6})\b\s*(CE|PE)\b/;

export type OrderWhyRow = {
  id?: string;
  side?: string;
  type?: string;
  status?: string;
  strategy?: string;
  role?: string;
  reason?: string;
  exitReason?: string;
  symbol?: string;
  securityId?: string;
  copyUserId?: string;
  price?: number;
  avg?: number;
  entry?: number;
  exit?: number;
  entryPrice?: number;
  slPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  buyPrice?: number;
  sellPrice?: number;
  pnl?: number;
  createdAt?: string;
};

function hasStrategy(row?: OrderWhyRow | null) {
  const name = String(row?.strategy || "").trim();
  return Boolean(name) && !/^(manual|auto)$/i.test(name);
}

export function normalizeExitRole(role = "") {
  const raw = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (raw === "stop-loss" || raw === "stoploss" || raw === "stop") return "sl";
  if (raw === "tgt" || raw === "tp") return "target";
  if (raw === "trailing" || raw === "trailing-sl") return "trail";
  return raw;
}

export function isBrokerNoiseReason(text = "") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return true;
  if (orderExitReason({ reason: raw, exitReason: raw })) return false;
  return BROKER_NOISE_RE.test(raw.toLowerCase());
}

export function orderExitReason(row?: OrderWhyRow | null) {
  const role = normalizeExitRole(row?.role);
  const tagged = `${row?.exitReason || ""} ${row?.reason || ""} ${row?.role || ""}`.toLowerCase();
  const brokerFail = BROKER_FAIL_RE.test(String(row?.reason || "").toLowerCase());
  if (role === "trail" || (TRAIL_RE.test(tagged) && !brokerFail)) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (SL_RE.test(tagged) && !brokerFail)) return "SL HIT";
  if (role === "target" || (TGT_RE.test(tagged) && !brokerFail)) return "TGT DONE";
  return "";
}

export function closeWhyFromPrices(row?: OrderWhyRow | null) {
  const side = String(row?.side || row?.type || "").toUpperCase();
  const fill = Number(row?.price || row?.exit || row?.sellPrice || 0);
  const entry = Number(row?.entryPrice || row?.entry || row?.avg || row?.buyPrice || 0);
  const sl = Number(row?.slPrice || row?.stopPrice || 0);
  const tgt = Number(row?.targetPrice || 0);
  const pnl = Number(row?.pnl);
  const closedTrade = entry > 0 && Number(row?.exit || row?.sellPrice || 0) > 0;
  if (side === "BUY" && !closedTrade) return "";
  if (side && side !== "SELL" && !closedTrade) return "";
  const trail = normalizeExitRole(row?.role) === "trail" || TRAIL_RE.test(String(row?.exitReason || row?.reason || ""));
  if (!(fill > 0) && !(Number.isFinite(pnl) && pnl !== 0 && closedTrade)) return "";
  if (sl > 0 && tgt > 0 && fill > 0) {
    const toSl = Math.abs(fill - sl);
    const toTgt = Math.abs(fill - tgt);
    if (toSl <= toTgt) return trail ? "TRAILING SL HIT" : "SL HIT";
    return "TGT DONE";
  }
  if (sl > 0 && fill > 0 && fill <= sl * 1.02) return trail ? "TRAILING SL HIT" : "SL HIT";
  if (tgt > 0 && fill > 0 && fill >= tgt * 0.98) return "TGT DONE";
  if (entry > 0 && fill > 0) {
    if (fill < entry) return trail ? "TRAILING SL HIT" : "SL HIT";
    if (fill > entry) return "TGT DONE";
  }
  if (Number.isFinite(pnl) && pnl !== 0 && (closedTrade || side === "SELL")) {
    if (pnl < 0) return trail ? "TRAILING SL HIT" : "SL HIT";
    if (pnl > 0) return "TGT DONE";
  }
  return "";
}

function roleWhy(role = "") {
  const raw = normalizeExitRole(role);
  if (raw === "hedge") return "HEDGE ENTRY";
  if (raw === "reversal") return "REVERSAL ENTRY";
  if (raw === "broker-test") return "TEST ORDER";
  if (raw === "eod" || raw === "eod-square-off") return "EOD EXIT";
  if (raw === "vwap-exit") return "VWAP EXIT";
  if (raw === "shivam-entry" || raw === "entry" || raw === "primary") return "ENTRY";
  if (raw === "exit") return "EXIT";
  return "";
}

export function displayOrderReason(row?: OrderWhyRow | null) {
  const status = String(row?.status || "").toUpperCase();
  const raw = String(row?.reason || row?.exitReason || "").trim();
  if (/REJECT|FAIL/.test(status)) {
    if (raw && !isBrokerNoiseReason(raw)) return raw;
    return "REJECTED";
  }
  const hit = orderExitReason(row);
  if (hit) return hit;
  const close = closeWhyFromPrices(row);
  if (close) return close;
  const fromRole = roleWhy(row?.role);
  if (fromRole && fromRole !== "EXIT") return fromRole;
  const side = String(row?.side || row?.type || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "ENTRY";
  if (fromRole) return fromRole;
  if (hasStrategy(row) && side === "SELL") return "EXIT";
  if (raw && !isBrokerNoiseReason(raw)) return raw;
  return "";
}

function contractKey(row?: OrderWhyRow | null) {
  const id = String(row?.securityId || "").trim();
  if (id && id !== "0") return `id:${id}`;
  const raw = String(row?.symbol || "")
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hit = raw.match(CONTRACT_RE);
  if (hit) {
    const root = hit[1] === "CRUDE" ? "CRUDEOIL" : hit[1];
    return `${root} ${hit[2]} ${hit[3]}`;
  }
  return raw;
}

export function sameWhyContract(left?: OrderWhyRow | null, right?: OrderWhyRow | null) {
  if (!left || !right) return false;
  const a = contractKey(left);
  const b = contractKey(right);
  return Boolean(a && b && a === b);
}

export function orderWhyForBook(row?: OrderWhyRow | null, book: OrderWhyRow[] = []) {
  if (!row) return "";
  const side = String(row.side || row.type || "").toUpperCase();
  const hasEntry = Number(row.entryPrice || row.entry || row.buyPrice || 0) > 0;
  if (side === "SELL" && !hasEntry) {
    const copyUserId = String(row.copyUserId || "");
    const buy = (book || []).find((item) => {
      if (!item || item === row) return false;
      if (String(item.side || item.type || "").toUpperCase() !== "BUY") return false;
      if (String(item.copyUserId || "") !== copyUserId) return false;
      if (!sameWhyContract(item, row)) return false;
      return Number(item.price || item.avg || 0) > 0;
    });
    if (buy) {
      return displayOrderReason({
        ...row,
        entryPrice: Number(buy.price || buy.avg),
        entry: Number(buy.price || buy.avg),
      });
    }
  }
  return displayOrderReason(row);
}

export function isExitHitReason(text: string) {
  return text === "SL HIT" || text === "TGT DONE" || text === "TRAILING SL HIT";
}

export function isEntryWhy(text: string) {
  return text === "ENTRY" || text === "HEDGE ENTRY" || text === "REVERSAL ENTRY" || text === "TEST ORDER";
}
