import { getPublicUser } from "./auth.js";
import { firstKotakMobile } from "./liveBrokers.js";
import { enrollmentActive, listEnrollments } from "./subscriptions.js";
import { brokerAccountForLiveCopy, listDeskRecords, peekClientSecrets, recordMemberCopyFill, saveClientSettings, sizeCopyQty } from "./memberDesk.js";
import { sendMemberCopyOrder } from "./liveCopySend.js";
import { sendQueuedLiveOrders } from "./liveOrderFlush.js";
import { exchangeSegmentFor } from "./optionChain.js";
import { isShivamT2sName } from "./shivamT2s/config.js";

let pendingCopySends = [];
const sentMemberExits = new Map();

export function resetMemberExitCopyLocks() {
  sentMemberExits.clear();
}

function firstPositive(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function memberExitLockKey(copy = {}) {
  const role = String(copy.role || copy.exitReason || "exit").trim().toLowerCase() || "exit";
  return [copy.copyUserId, copy.symbol, copy.side, copy.strategy, role].map((part) => String(part || "").trim()).join("|");
}

function claimMemberExitCopy(copy = {}) {
  if (!copy.copyUserId || !copy.symbol) return true;
  const key = memberExitLockKey(copy);
  if (sentMemberExits.has(key)) return false;
  sentMemberExits.set(key, Date.now());
  return true;
}

export function releaseMemberExitCopy(copy = {}) {
  if (!copy.copyUserId || !copy.symbol) return;
  sentMemberExits.delete(memberExitLockKey(copy));
}

export function clearMemberExitCopiesForEntry(copy = {}) {
  const userId = String(copy.copyUserId || "").trim();
  const symbol = String(copy.symbol || "").trim();
  const strategy = String(copy.strategy || "").trim();
  if (!userId || !symbol) return;
  for (const key of sentMemberExits.keys()) {
    const [uid, sym, , strat] = String(key).split("|");
    if (uid === userId && sym === symbol && (!strategy || strat === strategy)) {
      sentMemberExits.delete(key);
    }
  }
}

function strategyLabel(name) {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return "";
  if (isShivamT2sName(name) || isShivamT2sName(text)) return "shivam t2s";
  if (isNiftyFirstCandleName(text)) return "nifty";
  if (isCrudeFirstCandleName(text)) return "crude oil";
  return text;
}

function sameStrategy(left, right) {
  const a = strategyLabel(left);
  const b = strategyLabel(right);
  return Boolean(a && b && a === b);
}

export function findLiveCopyAlgo(algos = [], strategyName = "") {
  const name = String(strategyName || "").trim();
  const rows = Array.isArray(algos) ? algos : [];
  const pick = (list) => {
    const exact = list.find((row) => String(row.name || "") === name);
    if (exact) return exact;
    const family = list.filter((row) => sameStrategy(row.name, name));
    return family.find((row) => row.enabled) || family[0];
  };
  return pick(rows.filter((row) => !row?.testDesk)) || pick(rows.filter((row) => row?.testDesk)) || {};
}

function subscriptionOpen(until) {
  const day = String(until || "").trim();
  if (!day) return true;
  return day >= new Date().toISOString().slice(0, 10);
}

function isNiftyFirstCandleName(name) {
  const text = String(name || "").trim();
  if (!text || /crude/i.test(text)) return false;
  if (/^nifty$/i.test(text)) return true;
  return /nifty/i.test(text) && /first\s*candle/i.test(text);
}

function isCrudeFirstCandleName(name) {
  const text = String(name || "").trim();
  if (/^crude\s*oil$/i.test(text) || /^crudeoil$/i.test(text)) return true;
  if (!/crude/i.test(text) || !/first\s*candle/i.test(text)) return false;
  if (/(?:^|[^0-9])15\s*m/i.test(text)) return false;
  return true;
}

function deskCopyMatches({ strategyName, strategyId } = {}) {
  const mapped = new Set();
  const copyMaster = new Set();
  const name = String(strategyName || "").trim();
  const id = String(strategyId || "").trim();
  for (const row of listDeskRecords()) {
    if (!row.userId || row.userId === "admin") continue;
    if (!subscriptionOpen(row.subscriptionUntil)) continue;
    const mappedName = String(row.mappedStrategy || "").trim();
    const mappedHit =
      Boolean(mappedName) && (sameStrategy(mappedName, name) || mappedName === id || sameStrategy(mappedName, id));
    if (mappedHit) mapped.add(row.userId);
    const mode = String(row.subscriptionMode || "copy").toLowerCase();
    if (row.copy && subscriptionOpen(row.subscriptionUntil) && (mode === "copy" || mode === "both")) {
      copyMaster.add(row.userId);
    }
  }
  return { mapped, copyMaster };
}

function brokerKeyRequired(brokerId) {
  return ["zerodha", "fyers", "kotak", "angelone"].includes(String(brokerId || "").toLowerCase());
}

function brokerKeyLabel(brokerId) {
  const id = String(brokerId || "").toLowerCase();
  if (id === "kotak") return "Kotak Neo consumer key";
  if (id === "fyers") return "Fyers app ID";
  if (id === "angelone") return "Angel SmartAPI key";
  if (id === "zerodha") return "Zerodha API key";
  return "API key";
}

function copyTargetForUser(userId, { masterQty, lotSize, strategyId, strategyName, enrollment } = {}) {
  const desk = peekClientSecrets(userId);
  const brokerId = String(desk.brokerId || "paper").trim().toLowerCase();
  const slot = brokerAccountForLiveCopy(userId, brokerId);
  const canMintUpstox =
    brokerId === "upstox" &&
    Boolean(String(slot.brokerApiKey || desk.brokerApiKey || "").trim()) &&
    Boolean(String(slot.brokerSessionToken || desk.brokerSessionToken || "").trim());
  const leftoverSlot = Boolean(slot.leftoverToken) && !canMintUpstox;
  const token = leftoverSlot ? "" : String(slot.brokerToken || (!slot.leftoverToken && desk.brokerToken) || "").trim();
  const accountId = leftoverSlot ? "" : String(slot.accountId || desk.accountId || "").trim();
  const paper = brokerId === "paper";
  const qty = sizeCopyQty(masterQty, { sizingKind: desk.sizingKind, sizingValue: desk.sizingValue, lotSize });
  const base = {
    userId,
    enrollmentId: enrollment?.id || "",
    strategyId: enrollment?.strategyId || strategyId || "",
    strategyName: enrollment?.strategyName || strategyName || "",
    qty,
  };
  if (slot.adminKotak) {
    return {
      ...base,
      brokerId,
      accountId: "",
      leftoverSlot: true,
      brokerToken: "",
      brokerApiKey: "",
      brokerSessionToken: "",
      paper: false,
      copyBlocked: "This user is not the admin. The admin Kotak Neo login is not used for this order. Add this user's own Kotak Neo on Profile.",
    };
  }
  const apiKey = leftoverSlot || paper ? "" : String(slot.brokerApiKey || desk.brokerApiKey || "").trim();
  if (!paper && token && brokerKeyRequired(brokerId) && !apiKey) {
    return {
      ...base,
      brokerId,
      accountId: "",
      leftoverSlot: false,
      brokerToken: "",
      brokerApiKey: "",
      brokerSessionToken: "",
      paper: false,
      copyBlocked: `Paste this user's ${brokerKeyLabel(brokerId)} with the access token.`,
    };
  }
  const profileMobile = leftoverSlot || paper ? "" : String(getPublicUser(userId)?.mobile || "").trim();
  const brokerMobile =
    leftoverSlot || paper ? "" : firstKotakMobile(slot.brokerMobile, desk.brokerMobile, profileMobile);
  if (
    brokerId === "kotak" &&
    profileMobile &&
    !String(slot.brokerMobile || desk.brokerMobile || "").trim()
  ) {
    saveClientSettings(userId, { brokerMobile: profileMobile });
  }
  if (!paper && !token && !leftoverSlot && !canMintUpstox) {
    if (brokerId === "dhan" || brokerId === "upstox") {
      return {
        ...base,
        lane: desk.copy ? "copy" : "individual",
        brokerId,
        accountId: "",
        leftoverSlot: false,
        brokerToken: "",
        brokerApiKey: "",
        brokerSessionToken: "",
        paper: false,
        copyBlocked: "",
        adminDesk: true,
      };
    }
    const copyBlocked =
      brokerId === "kotak"
        ? "This user is not the admin. The admin Kotak Neo login is not used for this order. Add this user's own Kotak Neo on Profile."
        : `This member has no ${brokerId} access token. Install it on My plan.`;
    return {
      ...base,
      brokerId,
      accountId: "",
      leftoverSlot: false,
      brokerToken: "",
      brokerApiKey: "",
      brokerSessionToken: "",
      paper: false,
      copyBlocked,
    };
  }
  return {
    ...base,
    lane: desk.copy ? "copy" : "individual",
    brokerId: paper ? "paper" : brokerId,
    accountId,
    leftoverSlot,
    brokerToken: paper ? "" : token,
    brokerApiKey: apiKey,
    brokerSessionToken: leftoverSlot || paper ? "" : slot.brokerSessionToken || desk.brokerSessionToken,
    brokerMobile,
    profileMobile,
    brokerMpin: leftoverSlot || paper ? "" : slot.brokerMpin || desk.brokerMpin || "",
    brokerTotpSecret: leftoverSlot || paper ? "" : slot.brokerTotpSecret || desk.brokerTotpSecret || "",
    paper,
    copyBlocked: "",
  };
}

export function listLiveCopyTargets({
  strategyName,
  strategyId,
  masterQty,
  lotSize,
  mappedClientIds,
  mappingScope,
} = {}) {
  const scope = ["master", "clients", "both"].includes(String(mappingScope || "")) ? String(mappingScope) : "both";
  if (scope === "master") return [];
  const mapped = new Set((Array.isArray(mappedClientIds) ? mappedClientIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const paid = listEnrollments({ admin: true }).filter((row) => {
    if (!enrollmentActive(row)) return false;
    if (strategyId && row.strategyId === strategyId) return true;
    return sameStrategy(row.strategyName, strategyName);
  });
  const paidByUser = new Map(paid.map((row) => [row.userId, row]));
  const desks = deskCopyMatches({ strategyName, strategyId });
  const userIds = new Set();
  if (mapped.size) {
    for (const id of mapped) userIds.add(id);
  } else {
    for (const id of desks.mapped) userIds.add(id);
    for (const id of desks.copyMaster) userIds.add(id);
  }
  const targets = [];
  for (const userId of userIds) {
    const target = copyTargetForUser(userId, {
      masterQty,
      lotSize,
      strategyId,
      strategyName,
      enrollment: paidByUser.get(userId),
    });
    if (target) targets.push(target);
  }
  return targets;
}

export function listCopyOnTargets({ masterQty, lotSize } = {}) {
  const targets = [];
  for (const row of listDeskRecords()) {
    if (!row.userId || row.userId === "admin") continue;
    if (!row.copy || !subscriptionOpen(row.subscriptionUntil)) continue;
    const target = copyTargetForUser(row.userId, { masterQty, lotSize });
    if (target) targets.push(target);
  }
  return targets;
}

export function memberCopyPayloads(payload = {}, algo = {}) {
  const mode = String(algo.runMode || "").toLowerCase();
  if (algo?.testDesk && (mode === "paper" || mode === "backtest")) return [];
  const scope = String(algo.mappingScope || "both");
  if (scope === "master") return [];
  const targets = listLiveCopyTargets({
    strategyName: payload.strategy,
    strategyId: algo.id,
    masterQty: payload.qty,
    lotSize: payload.lotSize || payload.qty,
    mappedClientIds: algo.mappedClientIds,
    mappingScope: algo.mappingScope,
  });
  return targets.map((target) => ({
    ...payload,
    qty: target.qty,
    brokerId: target.brokerId,
    lane: target.lane === "copy" ? "copy" : "individual",
    copyUserId: target.userId,
    paper: target.paper,
    copyBlocked: target.copyBlocked || "",
    leftoverSlot: Boolean(target.leftoverSlot),
    account: target.paper || target.copyBlocked
      ? undefined
      : {
          clientId: target.accountId,
          accessToken: target.brokerToken,
          apiKey: target.brokerApiKey,
          sessionToken: target.brokerSessionToken,
          mobile: target.brokerMobile || target.profileMobile || "",
          profileMobile: target.profileMobile || "",
          mpin: target.brokerMpin || "",
          totpSecret: target.brokerTotpSecret || "",
          leftoverSlot: Boolean(target.leftoverSlot),
        },
    brokerSession: target.paper || target.copyBlocked
      ? undefined
      : {
          clientId: target.accountId,
          accessToken: target.brokerToken,
          apiKey: target.brokerApiKey,
          sessionToken: target.brokerSessionToken,
          mobile: target.brokerMobile || target.profileMobile || "",
          profileMobile: target.profileMobile || "",
          mpin: target.brokerMpin || "",
          totpSecret: target.brokerTotpSecret || "",
          leftoverSlot: Boolean(target.leftoverSlot),
        },
  }));
}

export function dispatchMemberCopies(payload = {}, algo = {}, { enqueueLiveOrder } = {}) {
  if (String(payload.side || "").toUpperCase() === "BUY" && algo?.holdDailyLive) return;
  const live = [];
  const exitCopy = /^(exit|target|sl)$/i.test(String(payload.role || ""));
  for (const copy of memberCopyPayloads(payload, algo || {})) {
    if (!exitCopy && String(copy.side || "").toUpperCase() === "BUY") {
      clearMemberExitCopiesForEntry(copy);
    }
    if (copy.paper || copy.brokerId === "paper") {
      recordMemberCopyFill({ userId: copy.copyUserId, payload: copy, paper: true });
      continue;
    }
    if (copy.copyBlocked) {
      recordMemberCopyFill({
        userId: copy.copyUserId,
        payload: copy,
        error: new Error(copy.copyBlocked),
      });
      console.log(`Member copy skipped ${copy.copyUserId}: ${copy.copyBlocked}`);
      continue;
    }
    if (exitCopy && !claimMemberExitCopy(copy)) continue;
    if (typeof enqueueLiveOrder === "function") {
      const result = enqueueLiveOrder(copy);
      if (exitCopy && result && result.queued === false && !result.duplicate) {
        releaseMemberExitCopy(copy);
      }
      continue;
    }
    live.push(copy);
  }
  if (!live.length) return;
  pendingCopySends.push(
    sendQueuedLiveOrders(live, {
      sendCopy: (copy) => sendMemberCopyOrder(copy),
    }).then((outcomes) => {
      for (const item of outcomes) {
        if (!item.ok) {
          releaseMemberExitCopy(item.payload);
          console.log(`Member copy order failed: ${item.error?.message || item.error}`);
        }
      }
      return outcomes;
    }),
  );
}

export function awaitMemberCopySends() {
  const jobs = pendingCopySends;
  pendingCopySends = [];
  return Promise.allSettled(jobs);
}

export function memberExitPayload(pos = {}, extras = {}) {
  const qty = Math.max(1, Math.round(Math.abs(Number(pos.qty) || 0)));
  const openSide = String(pos.type || pos.side || "BUY").toUpperCase();
  const side = openSide === "SELL" ? "BUY" : "SELL";
  const strategy = String(extras.strategy || pos.strategy || "").trim();
  const symbol = String(pos.symbol || extras.symbol || "").trim();
  return {
    symbol,
    name: symbol,
    side,
    qty,
    price: firstPositive(extras.price, pos.ltp, pos.avg, pos.buyPrice, pos.entry),
    product: pos.product || "MIS",
    type: "MARKET",
    role: extras.role || pos.role || "exit",
    exitReason: extras.exitReason || pos.exitReason || extras.role || pos.role || "",
    strategy,
    brokerId: pos.brokerId && pos.brokerId !== "paper" ? pos.brokerId : extras.brokerId || "dhan",
    securityId: pos.securityId,
    strike: pos.strike,
    option: pos.option,
    expiry: pos.expiry,
    kind: pos.kind || (pos.option ? "option" : undefined),
    lotSize: extras.lotSize || pos.lotSize || qty,
    exchangeSegment: extras.exchangeSegment || exchangeSegmentFor(symbol),
  };
}

export function dispatchMemberExitCopies(pos, algo = {}, { enqueueLiveOrder } = {}) {
  if (!pos || pos.copyUserId) return;
  const strategy = String(pos.strategy || algo?.name || "").trim();
  if (!strategy || !pos.symbol) return;
  const tagged = String(pos.role || pos.exitReason || "").toLowerCase();
  const role = tagged === "trail" || tagged === "trailing" || tagged === "trailing-sl"
    ? "trail"
    : tagged === "sl"
      ? "sl"
      : tagged === "target" || tagged === "tgt"
        ? "target"
        : "exit";
  const payload = memberExitPayload(pos, { strategy, role, exitReason: pos.exitReason || role });
  if (!(Number(payload.qty) > 0) || !payload.symbol) return;
  dispatchMemberCopies(payload, algo || {}, { enqueueLiveOrder });
}

export { recordMemberCopyFill, sizeCopyQty };
