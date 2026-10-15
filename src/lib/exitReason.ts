const TRAIL_RE = /trail|trailing[\s-]?sl/;
const SL_RE = /\bsl\b|stop[\s-]?loss|sl hit|hit stop/;
const TGT_RE = /\btgt\b|target|tgt done|primary-target|combined-target|initial-target/;
const BROKER_FAIL_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/;
const BROKER_NOISE_RE =
  /trade confirmed|sent to dhan|sent to kotak|not sent to dhan|desk demo|oms success|order placed|order traded|^traded$|^success$|^ok$|^submitted$|desk fill at ltp|paper fill at live ltp/;

export type OrderWhyRow = {
  side?: string;
  type?: string;
  status?: string;
  strategy?: string;
  role?: string;
  reason?: string;
  exitReason?: string;
};

function hasStrategy(row?: OrderWhyRow | null) {
  const name = String(row?.strategy || "").trim();
  return Boolean(name) && !/^(manual|auto)$/i.test(name);
}

export function isBrokerNoiseReason(text = "") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return true;
  if (orderExitReason({ reason: raw, exitReason: raw })) return false;
  return BROKER_NOISE_RE.test(raw.toLowerCase());
}

export function orderExitReason(row?: OrderWhyRow | null) {
  const role = String(row?.role || "").toLowerCase();
  const tagged = `${row?.exitReason || ""} ${row?.reason || ""}`.toLowerCase();
  const brokerFail = BROKER_FAIL_RE.test(String(row?.reason || "").toLowerCase());
  if (role === "trail" || role === "trailing" || role === "trailing-sl" || (TRAIL_RE.test(tagged) && !brokerFail)) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (SL_RE.test(tagged) && !brokerFail)) return "SL HIT";
  if (role === "target" || role === "tgt" || (TGT_RE.test(tagged) && (role === "target" || role === "tgt" || !brokerFail))) {
    return "TGT DONE";
  }
  return "";
}

function roleWhy(role = "") {
  const raw = String(role || "").toLowerCase();
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
  const fromRole = roleWhy(row?.role);
  if (fromRole) return fromRole;
  const side = String(row?.side || row?.type || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "ENTRY";
  if (hasStrategy(row) && side === "SELL") return "EXIT";
  if (raw && !isBrokerNoiseReason(raw)) return raw;
  return "";
}

export function isExitHitReason(text: string) {
  return text === "SL HIT" || text === "TGT DONE" || text === "TRAILING SL HIT";
}

export function isEntryWhy(text: string) {
  return text === "ENTRY" || text === "HEDGE ENTRY" || text === "REVERSAL ENTRY" || text === "TEST ORDER";
}
