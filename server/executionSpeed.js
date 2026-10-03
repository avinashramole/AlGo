import { isSaneOptionLtp } from "./positionMark.js";

let readLivePrice = () => 0;

export function setLivePriceReader(fn) {
  readLivePrice = typeof fn === "function" ? fn : () => 0;
}

export function roundTick(value, tick = 0.05) {
  const n = Number(value);
  if (!(n > 0) || !Number.isFinite(n)) return 0;
  const step = tick > 0 ? tick : 0.05;
  return Number((Math.round(n / step) * step).toFixed(2));
}

/**
 * A buy limit is the price we saw when the signal fired. If the option is already
 * trading higher (the target print), that limit sits behind the ask and the broker
 * never fills it. Cross the latest price, but only up to a capped chase.
 */
export function marketableBuyLimit(limit, live, { tick = 0.05, maxChase = 0.1 } = {}) {
  const base = roundTick(limit, tick);
  const now = Number(live);
  if (!(base > 0) || !(now > base)) return base;
  const cap = roundTick(base * (1 + Number(maxChase)), tick);
  const through = roundTick(now + tick, tick);
  return roundTick(Math.min(cap, Math.max(base, through)), tick);
}

export function crossBuyLimit(payload = {}) {
  if (String(payload?.side || "BUY").toUpperCase() === "SELL") return payload;
  if (String(payload?.type || "MARKET").toUpperCase() !== "LIMIT") return payload;
  const live = Number(readLivePrice(payload.symbol));
  const price = marketableBuyLimit(payload.price, live);
  if (!(price > 0) || price === Number(payload.price)) return payload;
  payload.price = price;
  return payload;
}

/** A security id is already on the order — don't wait on the scrip master download. */
export function needsScripMasterLookup(payload = {}) {
  const id = String(payload?.securityId ?? "").trim();
  if (id && id !== "0") return false;
  return Boolean(String(payload?.expiry || "").trim());
}

/**
 * One price for the stop and the target. A websocket tick wins once the
 * position has been marked, so a stale chain snapshot cannot hide 145 or
 * invent a stop from an old print.
 */
export function liveExitPrice({ chain, tick, avg, ticked } = {}) {
  const cost = Number(avg) || 0;
  const sane = (value) => (isSaneOptionLtp(value, cost) ? Number(value) : 0);
  const chainPx = sane(chain);
  const tickPx = sane(tick);
  if (ticked && tickPx) return tickPx;
  return chainPx || tickPx;
}

export function exitMarks(input = {}) {
  const mark = liveExitPrice(input);
  return { high: mark, low: mark, mark };
}

/**
 * Rest a LIMIT sell at the target while price is still under it, so the exchange
 * fills 145 itself. Once price is already there, MARKET — unless that limit is
 * already working, because a second sell would double the exit.
 */
export function planTargetExit({ mark, target, resting, tick = 0.05 } = {}) {
  const px = Number(mark);
  const goal = Number(target);
  if (!(goal > 0) || !(px > 0)) return { action: "none" };
  if (px + 1e-9 >= goal) {
    if (resting) return { action: "wait-resting" };
    return { action: "market" };
  }
  if (resting) return { action: "resting" };
  return { action: "arm", price: roundTick(goal, tick) };
}
