import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listPublicUsers } from "./auth.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { realStrategyName } from "./orderStrategy.js";
import { mappedClientIdsForMembers } from "./strategies.js";

const FILE =
  process.env.T2S_OPTION_CHAIN_MAP_FILE ||
  path.join(path.dirname(fileURLToPath(import.meta.url)), "data", "option-chain-map.json");

function emptyMap() {
  return { mappingScope: "both", mappedClientIds: [] };
}

function mappingIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function normalizeMap(row = {}) {
  const mappingScope = ["master", "clients", "both"].includes(String(row.mappingScope || ""))
    ? String(row.mappingScope)
    : "both";
  return { mappingScope, mappedClientIds: mappingIds(row.mappedClientIds) };
}

function readMap() {
  try {
    return normalizeMap(JSON.parse(fs.readFileSync(FILE, "utf8")));
  } catch {
    return emptyMap();
  }
}

let store = readMap();

function persist() {
  writeFileAtomic(FILE, `${JSON.stringify(store, null, 2)}\n`);
}

function memberIds() {
  return new Set(
    listPublicUsers()
      .filter((row) => row?.id && row.role !== "admin" && row.id !== "admin")
      .map((row) => row.id),
  );
}

function knownMemberIds(ids) {
  const allow = memberIds();
  if (!allow.size) return mappingIds(ids).filter((id) => id !== "admin");
  return mappedClientIdsForMembers(ids, allow);
}

export function getOptionChainMap() {
  const next = normalizeMap({
    ...store,
    mappedClientIds: knownMemberIds(store.mappedClientIds),
  });
  const changed =
    next.mappedClientIds.join("\0") !== store.mappedClientIds.join("\0") || next.mappingScope !== store.mappingScope;
  store = next;
  if (changed && fs.existsSync(FILE)) persist();
  return { mappingScope: next.mappingScope, mappedClientIds: [...next.mappedClientIds] };
}

export function saveOptionChainMap(payload = {}) {
  const next = normalizeMap({
    mappingScope: payload.mappingScope != null ? payload.mappingScope : store.mappingScope,
    mappedClientIds: payload.mappedClientIds != null ? payload.mappedClientIds : store.mappedClientIds,
  });
  store = {
    mappingScope: next.mappingScope,
    mappedClientIds: knownMemberIds(next.mappedClientIds),
  };
  persist();
  return getOptionChainMap();
}

export function dropOptionChainMappedClient(userId) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const next = store.mappedClientIds.filter((item) => item !== id);
  if (next.length === store.mappedClientIds.length) return false;
  store = { ...store, mappedClientIds: next };
  persist();
  return true;
}

export function optionChainCopyAlgo() {
  const map = getOptionChainMap();
  return {
    name: "Option Chain",
    mappingScope: map.mappingScope,
    mappedClientIds: map.mappedClientIds,
    runMode: "live",
    clientVisible: false,
  };
}

export function isManualChainOrder(payload = {}) {
  if (realStrategyName(payload?.strategy)) return false;
  const kind = String(payload?.kind || "").toLowerCase();
  return kind === "option" || kind === "future";
}
