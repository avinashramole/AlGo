export function orderExitReason(row?: { role?: string; reason?: string; exitReason?: string } | null) {
  const role = String(row?.role || "").toLowerCase();
  const tagged = `${row?.exitReason || ""} ${row?.reason || ""}`.toLowerCase();
  const brokerFail = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/.test(String(row?.reason || "").toLowerCase());
  if (role === "trail" || role === "trailing" || role === "trailing-sl" || (/trail|trailing[\s-]?sl/.test(tagged) && !brokerFail)) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (/\bsl\b|stop[\s-]?loss|sl hit/.test(tagged) && !brokerFail)) return "SL HIT";
  if (role === "target" || role === "tgt" || (/\btgt\b|target|tgt done/.test(tagged) && (role === "target" || role === "tgt" || !brokerFail))) {
    return "TGT DONE";
  }
  return "";
}

export function displayOrderReason(row?: { role?: string; reason?: string; exitReason?: string } | null) {
  return orderExitReason(row) || String(row?.reason || "").trim();
}

export function isExitHitReason(text: string) {
  return text === "SL HIT" || text === "TGT DONE" || text === "TRAILING SL HIT";
}
