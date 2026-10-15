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

export function exitReasonLabel(row = {}) {
  const role = String(row.role || "").toLowerCase();
  const tagged = String(row.exitReason || row.reason || "").toLowerCase();
  if (role === "trail" || role === "trailing" || role === "trailing-sl" || (TRAIL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (SL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "SL HIT";
  if (role === "target" || role === "tgt" || (TGT_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "TGT DONE";
  return "";
}

function hasStrategy(row = {}) {
  const name = String(row.strategy || "").trim();
  return Boolean(name) && !/^(manual|auto)$/i.test(name);
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

export function orderWhyLabel(row = {}) {
  const status = String(row.status || "").toUpperCase();
  const raw = String(row.reason || row.exitReason || "").trim();
  if (/REJECT|FAIL/.test(status)) {
    if (raw && !isBrokerNoiseReason(raw)) return raw;
    return "";
  }
  const hit = exitReasonLabel(row);
  if (hit) return hit;
  const fromRole = roleWhy(row.role);
  if (fromRole) return fromRole;
  const recalled = recallOrderWhy(row);
  if (recalled) return recalled;
  const side = String(row.side || row.type || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "ENTRY";
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
]);

export function preferOrderRole(...roles) {
  for (const role of roles) {
    const n = String(role || "").trim().toLowerCase();
    if (ROLE_SPECIFIC.has(n)) return String(role).trim();
  }
  for (const role of roles) {
    const n = String(role || "").trim();
    if (n) return n;
  }
  return "";
}

export function defaultOrderRole(row = {}) {
  const existing = String(row.role || "").trim();
  if (ROLE_SPECIFIC.has(existing.toLowerCase())) return existing;
  const fromWhy = exitRoleFromReason(row.exitReason || row.reason || "");
  if (["sl", "trail", "target", "eod", "vwap-exit", "entry"].includes(fromWhy) && (row.exitReason || exitReasonLabel(row))) {
    return fromWhy === "entry" ? "entry" : fromWhy;
  }
  const side = String(row.side || "").toUpperCase();
  if (hasStrategy(row) && side === "BUY") return "entry";
  if (hasStrategy(row) && side === "SELL") return "exit";
  return "";
}
