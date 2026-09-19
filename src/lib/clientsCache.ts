import { listClients, type ClientsList } from "../api/client";
import { mergeClientIntoList, shouldApplyFetchedList } from "./clientListState";

let cached: ClientsList | null = null;
let inflight: Promise<ClientsList> | null = null;
let epoch = 0;

function isAuthMiss(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /sign in first|admin only|401|403/i.test(msg);
}

export function peekClientList() {
  return cached;
}

export function applyClientList(result: ClientsList, fromEpoch?: number) {
  if (fromEpoch != null && !shouldApplyFetchedList(fromEpoch, epoch)) {
    return cached || result;
  }
  cached = result;
  return cached;
}

export function upsertCachedClient(client: ClientsList["clients"][number]) {
  epoch += 1;
  inflight = null;
  if (!cached || !client?.id) return client;
  cached = mergeClientIntoList(cached, client) as ClientsList;
  return client;
}

export function refreshClientList() {
  if (inflight) return inflight;
  const started = epoch;
  let request!: Promise<ClientsList>;
  request = (async () => {
    try {
      try {
        return applyClientList(await listClients(), started);
      } catch (error) {
        if (!isAuthMiss(error)) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        return applyClientList(await listClients(), started);
      }
    } finally {
      if (inflight === request) inflight = null;
    }
  })();
  inflight = request;
  return inflight;
}

export function loadClientList(force = false) {
  if (cached && !force) {
    void refreshClientList();
    return Promise.resolve(cached);
  }
  return refreshClientList();
}
