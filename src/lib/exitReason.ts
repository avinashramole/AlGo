export function isBrokerFillNote(text?: string | null) {
  return /trade confirmed|order confirmed|^confirmed$|^sent to dhan\b|^traded$|^filled$|^success$/.test(
    String(text || "").trim().toLowerCase(),
  );
}

export function orderExitReason(row?: { role?: string; reason?: string; exitReason?: string } | null) {
  const role = String(row?.role || "").toLowerCase();
  const tagged = `${row?.exitReason || ""} ${row?.reason || ""}`.toLowerCase();
  const brokerFail = /udapi|too many|reject|fail|unauthorized|token|429|rate limit/.test(String(row?.reason || "").toLowerCase());
  if (role === "trail" || role === "trailing" || role === "trailing-sl" || (/trail|trailing[\s-]?sl/.test(tagged) && !brokerFail)) {
    return "TRAILING SL HIT";
  }
  if (role === "sl" || (/\bsl\b|stop[\s-]?loss|sl hit/.test(tagged) && !brokerFail)) return "SL HIT";
  if (role === "target" || role === "tgt" || (/\btgt\b|target|tgt done|tgt hit/.test(tagged) && (role === "target" || role === "tgt" || !brokerFail))) {
    return "TGT HIT";
  }
  return "";
}

export function displayOrderReason(row?: { role?: string; reason?: string; exitReason?: string } | null) {
  const labeled = orderExitReason(row);
  if (labeled) return labeled;
  const text = String(row?.reason || "").trim();
  if (isBrokerFillNote(text)) return "";
  return text;
}

export function isExitHitReason(text: string) {
  return text === "SL HIT" || text === "TGT HIT" || text === "TGT DONE" || text === "TRAILING SL HIT";
}
