import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lastDailyResetAt, nextDailyRenewalAt, TOKEN_RENEW_HOUR_IST } from "./dhanToken.js";
import { listUpstoxOauthTargets, noteMemberUpstoxTokenAsk } from "./memberDesk.js";
import { requestUpstoxTradingTokenForUser } from "./upstoxAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const UPSTOX_DAILY_TOKEN_HOUR_IST = TOKEN_RENEW_HOUR_IST;
export const UPSTOX_DAILY_TOKEN_LABEL = "08:00 AM IST";

function dailyTokenFile() {
  return process.env.T2S_UPSTOX_DAILY_TOKEN_FILE || path.join(__dirname, "data", "upstox-daily-token.json");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function istParts(date = new Date()) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

export function istYmd(date = new Date()) {
  const parts = istParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function todayEightAmIst(from = Date.now()) {
  const ymd = istYmd(new Date(from));
  const at = Date.parse(`${ymd}T${pad2(UPSTOX_DAILY_TOKEN_HOUR_IST)}:00:00+05:30`);
  return Number.isFinite(at) ? at : from;
}

export function shouldAskUpstoxDailyTokens({ now = new Date(), lastAskedYmd = "" } = {}) {
  const at = now instanceof Date ? now : new Date(now);
  const todayEight = todayEightAmIst(at.getTime());
  if (at.getTime() < todayEight) return false;
  return istYmd(at) !== String(lastAskedYmd || "");
}

export function nextUpstoxDailyTokenAt(from = Date.now(), lastAskedYmd = "") {
  const now = Number(from);
  const todayEight = todayEightAmIst(now);
  if (now >= todayEight && istYmd(new Date(now)) !== String(lastAskedYmd || "")) {
    return now + 5_000;
  }
  return nextDailyRenewalAt(now, UPSTOX_DAILY_TOKEN_HOUR_IST);
}

export function tradingTokenFreshAfterReset(tokenUpdatedAt, from = Date.now()) {
  const updated = Date.parse(tokenUpdatedAt || "");
  if (!Number.isFinite(updated) || updated <= 0) return false;
  return updated >= lastDailyResetAt(from, UPSTOX_DAILY_TOKEN_HOUR_IST);
}

export function loadUpstoxDailyAskedYmd() {
  try {
    const row = JSON.parse(fs.readFileSync(dailyTokenFile(), "utf8"));
    return String(row?.lastAskedYmd || "");
  } catch {
    return "";
  }
}

export function saveUpstoxDailyAskedYmd(ymd) {
  const next = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return "";
  fs.mkdirSync(path.dirname(dailyTokenFile()), { recursive: true });
  fs.writeFileSync(dailyTokenFile(), `${JSON.stringify({ lastAskedYmd: next }, null, 2)}\n`);
  return next;
}

export async function askUpstoxDailyTokens({
  now = new Date(),
  lastAskedYmd = "",
  fetchImpl = fetch,
  targets,
  notify = noteMemberUpstoxTokenAsk,
} = {}) {
  const at = now instanceof Date ? now : new Date(now);
  if (!shouldAskUpstoxDailyTokens({ now: at, lastAskedYmd })) {
    return { asked: [], skipped: [], failed: [], lastAskedYmd, reason: "not-window" };
  }
  const rows = Array.isArray(targets) ? targets : listUpstoxOauthTargets();
  const asked = [];
  const skipped = [];
  const failed = [];
  for (const row of rows) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    if (tradingTokenFreshAfterReset(row.tokenUpdatedAt, at.getTime())) {
      skipped.push({ userId, reason: "already-fresh" });
      continue;
    }
    try {
      const result = await requestUpstoxTradingTokenForUser(userId, fetchImpl);
      if (!result.ok) {
        skipped.push({ userId, reason: result.reason || "missing_oauth" });
        continue;
      }
      asked.push({ userId, expiresAt: result.expiresAt || "" });
      if (typeof notify === "function") {
        notify(userId, {
          text: "Asked Upstox for today's trading token. Approve the Upstox app or WhatsApp notification.",
        });
      }
    } catch (error) {
      failed.push({ userId, error: String(error.message || error) });
    }
  }
  const ymd = istYmd(at);
  return {
    asked,
    skipped,
    failed,
    lastAskedYmd: ymd,
    reason: asked.length ? "asked" : rows.length ? "none-ready" : "no-oauth-users",
  };
}

export function startUpstoxDailyTokenScheduler({
  getNow = () => Date.now(),
  ask = askUpstoxDailyTokens,
  loadAskedYmd = loadUpstoxDailyAskedYmd,
  saveAskedYmd = saveUpstoxDailyAskedYmd,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
} = {}) {
  let timer = null;
  let stopped = false;

  const scheduleNext = (lastAskedYmd = loadAskedYmd()) => {
    if (stopped) return;
    const now = Number(getNow());
    const next = nextUpstoxDailyTokenAt(now, lastAskedYmd);
    timer = setTimeoutFn(onFire, Math.max(250, next - now));
  };

  const onFire = async () => {
    if (stopped) return;
    const lastAskedYmd = loadAskedYmd();
    let result;
    try {
      result = await ask({ now: new Date(getNow()), lastAskedYmd });
    } catch (error) {
      console.log(`Upstox 08:00 IST trading-token request failed: ${error.message || error}`);
    }
    if (result?.lastAskedYmd && result.reason !== "not-window") {
      saveAskedYmd(result.lastAskedYmd);
    }
    const asked = result?.asked?.length || 0;
    const skipped = result?.skipped?.length || 0;
    const failed = result?.failed?.length || 0;
    if (result && result.reason !== "not-window") {
      console.log(
        `Upstox 08:00 IST trading tokens · asked ${asked} · skipped ${skipped} · failed ${failed} · approve in the Upstox app`,
      );
    }
    if (!stopped) scheduleNext(result?.lastAskedYmd || loadAskedYmd());
  };

  scheduleNext();
  const next = nextUpstoxDailyTokenAt(getNow(), loadAskedYmd());
  console.log(
    `Upstox daily trading token is set: ${UPSTOX_DAILY_TOKEN_LABEL} for every stored API key + secret · next ${new Date(next).toISOString()} · restart does not start LIVE`,
  );
  return () => {
    stopped = true;
    if (timer != null) clearTimeoutFn(timer);
  };
}
