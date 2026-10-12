const TRAIL_RE = /trail|trailing[\s-]?sl/;
const SL_RE = /\bsl\b|stop[\s-]?loss|sl hit|hit stop/;
const TGT_RE = /\btgt\b|target|tgt done|primary-target|combined-target|initial-target/;
const BROKER_FAIL_RE = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/;

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

export function keepExitReason(current, incoming) {
  const kept = exitReasonLabel({ reason: current, exitReason: current });
  if (kept) return kept;
  const next = exitReasonLabel({ reason: incoming, exitReason: incoming });
  if (next) return next;
  const text = String(incoming || current || "").trim();
  return text;
}

export function exitRoleFromReason(reason = "") {
  const label = exitReasonLabel({ exitReason: reason, role: reason });
  if (label === "TRAILING SL HIT") return "trail";
  if (label === "SL HIT") return "sl";
  if (label === "TGT DONE") return "target";
  return String(reason || "exit").toLowerCase() === "exit" ? "exit" : String(reason || "exit");
}
