import { listDeskRecords, listUpstoxOauthTargets, peekClientSecrets } from "./memberDesk.js";
import { memberQuotesForUser } from "./memberQuotesFeed.js";
import { requestUpstoxTradingTokenForUser } from "./upstoxAuth.js";
import { tradingTokenFreshAfterReset } from "./upstoxDailyToken.js";

const BOOT_REASONS = new Set(["boot", "deploy", "paper-to-live", "live-start", "paper-start"]);

export function shouldResumeMemberFeeds(reason) {
  return BOOT_REASONS.has(String(reason || ""));
}

export function listMemberQuoteTargets(rows = listDeskRecords()) {
  const out = [];
  for (const row of rows || []) {
    const userId = String(row?.userId || "").trim();
    if (!userId || userId === "admin") continue;
    const secrets = peekClientSecrets(userId);
    const brokerId = String(secrets.brokerId || row.brokerId || "paper").trim().toLowerCase() || "paper";
    if (brokerId === "paper") continue;
    if (!String(secrets.brokerToken || "").trim()) continue;
    out.push({ userId, brokerId });
  }
  return out;
}

export async function ensureMemberDataFeedsRunning(reason = "boot", { askUpstox, warmQuotes } = {}) {
  if (!shouldResumeMemberFeeds(reason)) {
    return { asked: 0, warmed: 0, skipped: true, reason };
  }
  const ask = typeof askUpstox === "function" ? askUpstox : requestUpstoxTradingTokenForUser;
  const warm = typeof warmQuotes === "function" ? warmQuotes : (user) => memberQuotesForUser(user);
  let asked = 0;
  for (const row of listUpstoxOauthTargets()) {
    if (row.hasTradingToken && tradingTokenFreshAfterReset(row.tokenUpdatedAt)) continue;
    try {
      const result = await ask(row.userId);
      if (result?.ok) asked += 1;
    } catch (error) {
      console.log(`Member Upstox feed start (${reason}) failed for ${row.userId}: ${error.message || error}`);
    }
  }
  let warmed = 0;
  for (const row of listMemberQuoteTargets()) {
    try {
      const quotes = await warm({ id: row.userId });
      if (quotes?.live || (quotes?.indices || []).some((item) => Number(item?.price) > 0)) warmed += 1;
    } catch (error) {
      console.log(`Member quote warm (${reason}) failed for ${row.userId}: ${error.message || error}`);
    }
  }
  console.log(
    `Member data feeds (${reason}): Upstox asked ${asked} · quote desks warmed ${warmed}. Users do not restart the feed.`,
  );
  return { asked, warmed, skipped: false, reason };
}
