import { enrollmentActive, listEnrollments } from "./subscriptions.js";
import { peekClientSecrets, recordMemberCopyFill, sizeCopyQty } from "./memberDesk.js";

function sameStrategy(left, right) {
  const a = String(left || "").trim().toLowerCase();
  const b = String(right || "").trim().toLowerCase();
  return Boolean(a && b && a === b);
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
  const targets = [];
  for (const row of paid) {
    if (scope === "clients" && mapped.size && !mapped.has(row.userId)) continue;
    const desk = peekClientSecrets(row.userId);
    const brokerId = String(desk.brokerId || "paper").trim().toLowerCase();
    const paper = brokerId === "paper" || desk.tradeMode !== "real";
    if (!paper && desk.copy === false) continue;
    const token = String(desk.brokerToken || "").trim();
    if (!paper && !token) continue;
    targets.push({
      userId: row.userId,
      enrollmentId: row.id,
      strategyId: row.strategyId,
      strategyName: row.strategyName,
      brokerId: paper ? "paper" : brokerId,
      accountId: desk.accountId || "",
      brokerToken: paper ? "" : token,
      brokerApiKey: paper ? "" : desk.brokerApiKey,
      brokerSessionToken: paper ? "" : desk.brokerSessionToken,
      paper,
      qty: sizeCopyQty(masterQty, { sizingKind: desk.sizingKind, sizingValue: desk.sizingValue, lotSize }),
    });
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

export { recordMemberCopyFill, sizeCopyQty };
