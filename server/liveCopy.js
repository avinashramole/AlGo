import { enrollmentActive, listEnrollments } from "./subscriptions.js";
import { peekClientSecrets, recordMemberCopyFill, sizeCopyQty } from "./memberDesk.js";

function sameStrategy(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
}

function copyTargetForUser(userId, { masterQty, lotSize, strategyId, strategyName, enrollment } = {}) {
  const desk = peekClientSecrets(userId);
  const brokerId = String(desk.brokerId || "paper").trim().toLowerCase();
  const paper = brokerId === "paper" || desk.tradeMode !== "real";
  if (!paper && desk.copy === false) return null;
  const token = String(desk.brokerToken || "").trim();
  if (!paper && !token) return null;
  return {
    userId,
    enrollmentId: enrollment?.id || "",
    strategyId: enrollment?.strategyId || strategyId || "",
    strategyName: enrollment?.strategyName || strategyName || "",
    brokerId: paper ? "paper" : brokerId,
    accountId: desk.accountId || "",
    brokerToken: paper ? "" : token,
    brokerApiKey: paper ? "" : desk.brokerApiKey,
    brokerSessionToken: paper ? "" : desk.brokerSessionToken,
    paper,
    qty: sizeCopyQty(masterQty, { sizingKind: desk.sizingKind, sizingValue: desk.sizingValue, lotSize }),
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
  const userIds = new Set(paid.map((row) => row.userId));
  if (scope === "clients" || scope === "both") {
    for (const id of mapped) userIds.add(id);
  }
  const targets = [];
  for (const userId of userIds) {
    if ((scope === "clients" || scope === "both") && mapped.size && !mapped.has(userId)) continue;
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

export function memberCopyPayloads(payload = {}, algo = {}) {
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
    copyUserId: target.userId,
    paper: target.paper,
    account: target.paper
      ? undefined
      : {
          clientId: target.accountId,
          accessToken: target.brokerToken,
          apiKey: target.brokerApiKey,
          sessionToken: target.brokerSessionToken,
        },
    brokerSession: target.paper
      ? undefined
      : {
          clientId: target.accountId,
          accessToken: target.brokerToken,
          apiKey: target.brokerApiKey,
          sessionToken: target.brokerSessionToken,
        },
  }));
}

export function dispatchMemberCopies(payload = {}, algo = {}, { enqueueLiveOrder } = {}) {
  for (const copy of memberCopyPayloads(payload, algo || {})) {
    if (copy.paper || copy.brokerId === "paper") {
      recordMemberCopyFill({ userId: copy.copyUserId, payload: copy, paper: true });
      continue;
    }
    if (typeof enqueueLiveOrder === "function") enqueueLiveOrder(copy);
  }
}

export { recordMemberCopyFill, sizeCopyQty };
