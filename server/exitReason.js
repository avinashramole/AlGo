const TRAIL_RE = /trail|trailing[\s-]?sl/;
const SL_RE = /\bsl\b|stop[\s-]?loss|sl hit|hit stop/;
const TGT_RE = /\btgt\b|target|tgt done|tgt hit|primary-target|combined-target|initial-target/;
const BROKER_FAIL_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/;
const BROKER_FILL_RE = /trade confirmed|order confirmed|^confirmed$|^sent to dhan\b|^traded$|^filled$|^success$/;

export function isBrokerFillNote(text) {
  return BROKER_FILL_RE.test(String(text || "").trim().toLowerCase());
}

export function isExitHitLabel(text) {
  const raw = String(text || "").trim().toUpperCase();
  return raw === "SL HIT" || raw === "TGT HIT" || raw === "TGT DONE" || raw === "TRAILING SL HIT";
}

export function exitReasonLabel(row = {}) {
  const role = String(row.role || "").toLowerCase();
  const tagged = String(row.exitReason || row.reason || "").toLowerCase();
  if (role === "trail" || role === "trailing" || role === "trailing-sl" || (TRAIL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (SL_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "SL HIT";
  if (role === "target" || role === "tgt" || (TGT_RE.test(tagged) && !BROKER_FAIL_RE.test(tagged))) return "TGT HIT";
  return "";
}

export function keepExitReason(current, incoming) {
  const kept = exitReasonLabel({ reason: current, exitReason: current });
  if (kept) return kept;
  const next = exitReasonLabel({ reason: incoming, exitReason: incoming });
  if (next) return next;
  const prior = String(current || "").trim();
  if (prior && !isBrokerFillNote(prior)) return prior;
  const text = String(incoming || "").trim();
  if (isBrokerFillNote(text)) return "";
  return text;
}

export function exitRoleFromReason(reason = "") {
  const label = exitReasonLabel({ exitReason: reason, role: reason });
  if (label === "TRAILING SL HIT") return "trail";
  if (label === "SL HIT") return "sl";
  if (label === "TGT HIT") return "target";
  return String(reason || "exit").toLowerCase() === "exit" ? "exit" : String(reason || "exit");
}

export function bookContractKey(symbol = "") {
  const raw = String(symbol || "")
    .toUpperCase()
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const hit = raw.match(/\b(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|CRUDEOIL)\b.*?\b(\d{3,6})\b\s+(CE|PE)\b/);
  if (hit) return `${hit[1]} ${hit[2]} ${hit[3]}`;
  return raw;
}

export function sameBookContract(left, right) {
  const key = bookContractKey(left?.symbol);
  return Boolean(key) && key === bookContractKey(right?.symbol);
}

function filledBookRow(row) {
  const status = String(row?.status || "").toUpperCase();
  return status === "FILLED" || status === "TRADED";
}

function bookSide(row) {
  return String(row?.side || "").toUpperCase();
}

function bookPrice(row) {
  const n = Number(row?.price || row?.avg || 0);
  return Number.isFinite(n) ? n : 0;
}

function bookTime(row) {
  const ms = Date.parse(String(row?.createdAt || ""));
  return Number.isFinite(ms) && ms > 0 ? ms : 0;
}

function pickMatchingFill(orders, row, side) {
  const peers = (Array.isArray(orders) ? orders : []).filter(
    (item) => item && item !== row && filledBookRow(item) && bookSide(item) === side && sameBookContract(item, row) && bookPrice(item) > 0,
  );
  if (!peers.length) return null;
  const t = bookTime(row);
  const earlier = t ? peers.filter((item) => bookTime(item) && bookTime(item) <= t) : [];
  const pool = earlier.length ? earlier : peers;
  return pool.slice().sort((a, b) => bookTime(b) - bookTime(a) || bookPrice(b) - bookPrice(a))[0] || null;
}

export function inferFilledExitLabel(orders, row) {
  if (!row || !filledBookRow(row)) return "";
  const labeled = exitReasonLabel(row);
  if (labeled) return labeled;
  const side = bookSide(row);
  const exitPx = bookPrice(row);
  if (!(exitPx > 0)) return "";
  if (side === "SELL") {
    const entry = pickMatchingFill(orders, row, "BUY");
    const entryPx = bookPrice(entry);
    if (!(entryPx > 0)) return "";
    if (exitPx < entryPx) return "SL HIT";
    if (exitPx > entryPx) return "TGT HIT";
    return "";
  }
  return "";
}

export function stampExitReasons(orders) {
  const list = Array.isArray(orders) ? orders : [];
  for (const row of list) {
    if (!row) continue;
    const labeled = inferFilledExitLabel(list, row);
    if (labeled) {
      row.exitReason = labeled;
      row.reason = keepExitReason(row.reason, labeled);
      if (!row.role) row.role = exitRoleFromReason(labeled);
      continue;
    }
    if (isBrokerFillNote(row.reason)) row.reason = "";
    if (isBrokerFillNote(row.exitReason)) row.exitReason = "";
  }
  return list;
}
