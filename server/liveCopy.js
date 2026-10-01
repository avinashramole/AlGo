import { enrollmentActive, listEnrollments } from "./subscriptions.js";
import { brokerAccountForLiveCopy, listDeskRecords, peekClientSecrets, recordMemberCopyFill, sizeCopyQty } from "./memberDesk.js";
import { sendMemberCopyOrder } from "./liveCopySend.js";
import { exchangeSegmentFor } from "./optionChain.js";

let pendingCopySends = [];

function sameStrategy(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function subscriptionOpen(until) {
  const day = String(until || "").trim();
  if (!day) return true;
  return day >= new Date().toISOString().slice(0, 10);
}

function isNiftyFirstCandleName(name) {
  const text = String(name || "");
  return /nifty/i.test(text) && /first\s*candle/i.test(text) && !/crude/i.test(text);
}

function isCrudeFirstCandleName(name) {
  const text = String(name || "");
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
    if (row.copy && subscriptionOpen(row.subscriptionUntil)) {
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
  if (!paper && !token && !leftoverSlot && !canMintUpstox) {
    const copyBlocked =
      brokerId === "dhan"
        ? "This member has no Dhan Client ID + Access Token. Install them on My plan."
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
    brokerMobile: leftoverSlot || paper ? "" : slot.brokerMobile || desk.brokerMobile || "",
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
  if (scope === "both") {
    for (const row of paid) userIds.add(row.userId);
    if (!mapped.size) {
      for (const id of desks.copyMaster) userIds.add(id);
    }
  }
  if (scope === "clients" || scope === "both") {
    for (const id of mapped) userIds.add(id);
    for (const id of desks.mapped) userIds.add(id);
  }
  if (scope === "both" && mapped.size) {
    for (const id of desks.copyMaster) {
      if (mapped.has(id)) userIds.add(id);
    }
    for (const id of [...userIds]) {
      if (!mapped.has(id) && !desks.mapped.has(id)) userIds.delete(id);
    }
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

function mergeCopyTargets(...lists) {
  const byUser = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      if (row?.userId) byUser.set(row.userId, row);
    }
  }
  return [...byUser.values()];
}

/** Crude already copies to its mapped user. NIFTY 5m first candle uses that same user. */
function niftySharesCrudeCopyTargets(payload = {}, algo = {}) {
  if (String(algo.mappingScope || "") === "master") return [];
  if (!isNiftyFirstCandleName(payload.strategy)) return [];
  const ids = new Set();
  for (const id of Array.isArray(algo.alsoMappedClientIds) ? algo.alsoMappedClientIds : []) {
    const clean = String(id || "").trim();
    if (clean && clean !== "admin") ids.add(clean);
  }
  for (const row of listDeskRecords()) {
    if (!row.userId || row.userId === "admin") continue;
    if (!subscriptionOpen(row.subscriptionUntil)) continue;
    if (!isCrudeFirstCandleName(row.mappedStrategy)) continue;
    ids.add(row.userId);
  }
  const targets = [];
  for (const userId of ids) {
    const target = copyTargetForUser(userId, {
      masterQty: payload.qty,
      lotSize: payload.lotSize || payload.qty,
      strategyId: algo.id,
      strategyName: payload.strategy,
    });
    if (target) targets.push(target);
  }
  return targets;
}

export function memberCopyPayloads(payload = {}, algo = {}) {
  const targets = mergeCopyTargets(
    listLiveCopyTargets({
      strategyName: payload.strategy,
      strategyId: algo.id,
      masterQty: payload.qty,
      lotSize: payload.lotSize || payload.qty,
      mappedClientIds: algo.mappedClientIds,
      mappingScope: algo.mappingScope,
    }),
    listCopyOnTargets({
      masterQty: payload.qty,
      lotSize: payload.lotSize || payload.qty,
    }),
    niftySharesCrudeCopyTargets(payload, algo),
  );
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
          mobile: target.brokerMobile || "",
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
          mobile: target.brokerMobile || "",
          mpin: target.brokerMpin || "",
          totpSecret: target.brokerTotpSecret || "",
          leftoverSlot: Boolean(target.leftoverSlot),
        },
  }));
}

export function dispatchMemberCopies(payload = {}, algo = {}, { enqueueLiveOrder } = {}) {
  for (const copy of memberCopyPayloads(payload, algo || {})) {
    if (copy.paper || copy.brokerId === "paper") {
      recordMemberCopyFill({ userId: copy.copyUserId, payload: copy, paper: true });
      continue;
    }
    if (typeof enqueueLiveOrder === "function") {
      enqueueLiveOrder(copy);
      continue;
    }
    pendingCopySends.push(
      sendMemberCopyOrder(copy).catch((error) => {
        console.log(`Member copy order failed: ${error.message || error}`);
        return null;
      }),
    );
  }
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
    price: Number(extras.price || pos.ltp || pos.avg || 0),
    product: pos.product || "MIS",
    type: "MARKET",
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
  dispatchMemberCopies(memberExitPayload(pos, { strategy }), algo || {}, { enqueueLiveOrder });
}

export { recordMemberCopyFill, sizeCopyQty };
