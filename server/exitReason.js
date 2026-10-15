const TRAIL_RE = /trail|trailing[\s-]?sl/;
const SL_RE = /\bsl\b|stop[\s-]?loss|sl hit|hit stop/;
const TGT_RE = /\btgt\b|target|tgt done|primary-target|combined-target|initial-target/;
const BROKER_FAIL_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/;
const BROKER_ERROR_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit|insufficient|rms |notional|margin|\bfunds\b|not sent/;
const BROKER_NOISE_RE =
  /trade confirmed|sent to dhan|sent to kotak|not sent to dhan|desk demo|oms success|order placed|order traded|^traded$|^success$|^ok$|^submitted$|desk fill at ltp|paper fill at live ltp/;
const WHY_RANK = {
  "TRAILING SL HIT": 90,
  "SL HIT": 80,
  "TGT DONE": 80,
  "EOD EXIT": 55,
  "VWAP EXIT": 55,
  "HEDGE ENTRY": 45,
  "REVERSAL ENTRY": 45,
  "TEST ORDER": 42,
  ENTRY: 35,
  EXIT: 20,
};
const whyMemory = new Map();

export function isBrokerNoiseReason(text = "") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return true;
  if (exitReasonLabel({ reason: raw, exitReason: raw })) return false;
  return BROKER_NOISE_RE.test(raw.toLowerCase());
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

export function closeWhyFromPrices(row = {}) {
  const side = String(row.side || row.type || "").toUpperCase();
  const fill = Number(row.price || row.exit || row.fill || row.sellPrice || 0);
  const entry = Number(row.entryPrice || row.entry || row.avg || row.buyPrice || 0);
  const sl = Number(row.slPrice || row.stopPrice || 0);
  const tgt = Number(row.targetPrice || 0);
  const pnl = Number(row.pnl);
  const closedTrade = entry > 0 && Number(row.exit || row.sellPrice || 0) > 0;
  if (side === "BUY" && !closedTrade) return "";
  if (side && side !== "SELL" && !closedTrade) return "";
  const trail = normalizeExitRole(row.role) === "trail" || TRAIL_RE.test(String(row.exitReason || row.reason || ""));
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

export function exitReasonLabel(row = {}) {
  const role = normalizeExitRole(row.role);
  const tagged = `${row.exitReason || ""} ${row.reason || ""} ${row.role || ""}`.toLowerCase();
  if (role === "trail" || (TRAIL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (SL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "SL HIT";
  if (role === "target" || (TGT_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "TGT DONE";
  return "";
}

function hasStrategy(row = {}) {
  const name = String(row.strategy || "").trim();
  return Boolean(name) && !/^(manual|auto)$/i.test(name);
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

export function orderWhyLabel(row = {}) {
  const status = String(row.status || "").toUpperCase();
  const raw = String(row.reason || row.exitReason || "").trim();
  if (/REJECT|FAIL/.test(status)) {
    if (raw && !isBrokerNoiseReason(raw)) return raw;
    return "";
  }
  const hit = exitReasonLabel(row);
  if (hit) return hit;
  const close = closeWhyFromPrices(row);
  if (close) return close;
  const fromRole = roleWhy(row.role);
  if (fromRole && fromRole !== "EXIT") return fromRole;
  const recalled = recallOrderWhy(row);
  if (recalled && recalled !== "EXIT") return recalled;
  const side = String(row.side || row.type || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "ENTRY";
  if (fromRole) return fromRole;
  if (recalled) return recalled;
  if (hasStrategy(row) && side === "SELL") return "EXIT";
  if (raw && !isBrokerNoiseReason(raw)) return raw;
  return "";
}

function whyRank(label) {
  if (!label) return 0;
  if (WHY_RANK[label]) return WHY_RANK[label];
  if (isBrokerNoiseReason(label)) return 0;
  if (BROKER_ERROR_RE.test(String(label).toLowerCase())) return 70;
  return 15;
}

export function keepExitReason(current, incoming) {
  const kept = orderWhyLabel({ reason: current, exitReason: current, role: current });
  const next = orderWhyLabel({ reason: incoming, exitReason: incoming, role: incoming });
  if (whyRank(next) > whyRank(kept)) return next;
  if (whyRank(kept) > 0) return kept;
  const text = String(incoming || current || "").trim();
  return isBrokerNoiseReason(text) ? "" : text;
}

export function exitRoleFromReason(reason = "") {
  const label = orderWhyLabel({ exitReason: reason, role: reason, reason });
  if (label === "TRAILING SL HIT") return "trail";
  if (label === "SL HIT") return "sl";
  if (label === "TGT DONE") return "target";
  if (label === "ENTRY" || label === "HEDGE ENTRY" || label === "REVERSAL ENTRY" || label === "TEST ORDER") return "entry";
  if (label === "EOD EXIT") return "eod";
  if (label === "VWAP EXIT") return "vwap-exit";
  if (label === "EXIT") return "exit";
  return String(reason || "exit").toLowerCase() === "exit" ? "exit" : String(reason || "exit");
}

export function rememberOrderWhy(row = {}, why = "") {
  const label = orderWhyLabel({ ...row, reason: why || row.reason, exitReason: why || row.exitReason, role: row.role });
  if (!label) return "";
  if (row.id) whyMemory.set(`id:${row.id}`, label);
  const corr = String(row.correlationId || "").trim();
  if (corr && !/^t2s\d+$/i.test(corr)) whyMemory.set(`corr:${corr}`, label);
  return label;
}

export function recallOrderWhy(row = {}) {
  if (row.id && whyMemory.has(`id:${row.id}`)) return whyMemory.get(`id:${row.id}`);
  const corr = String(row.correlationId || "").trim();
  if (corr && whyMemory.has(`corr:${corr}`)) return whyMemory.get(`corr:${corr}`);
  return "";
}

export function clearOrderWhyMemory() {
  whyMemory.clear();
}

const ROLE_SPECIFIC = new Set([
  "trail",
  "trailing",
  "trailing-sl",
  "sl",
  "target",
  "tgt",
  "eod",
  "eod-square-off",
  "vwap-exit",
  "hedge",
  "reversal",
  "broker-test",
  "entry",
  "shivam-entry",
  "primary",
  "stop-loss",
  "stoploss",
]);

export function preferOrderRole(...roles) {
  for (const role of roles) {
    const n = normalizeExitRole(role);
    if (ROLE_SPECIFIC.has(n) || n === "stop-loss" || n === "stoploss") return n === "stop-loss" || n === "stoploss" ? "sl" : n;
  }
  for (const role of roles) {
    const n = String(role || "").trim();
    if (n) return n;
  }
  return "";
}

export function defaultOrderRole(row = {}) {
  const existing = normalizeExitRole(row.role);
  if (ROLE_SPECIFIC.has(existing)) return existing;
  const close = closeWhyFromPrices(row);
  if (close === "TRAILING SL HIT") return "trail";
  if (close === "SL HIT") return "sl";
  if (close === "TGT DONE") return "target";
  const fromWhy = exitRoleFromReason(row.exitReason || row.reason || "");
  if (["sl", "trail", "target", "eod", "vwap-exit", "entry"].includes(fromWhy) && (row.exitReason || exitReasonLabel(row) || close)) {
    return fromWhy === "entry" ? "entry" : fromWhy;
  }
  const side = String(row.side || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "entry";
  if (hasStrategy(row) && side === "SELL") return close ? (close === "TGT DONE" ? "target" : "sl") : "exit";
  return "";
}
