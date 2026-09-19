import { listClients, type ClientsList } from "../api/client";

let cached: ClientsList | null = null;
let inflight: Promise<ClientsList> | null = null;

function isAuthMiss(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error || "");
  return /sign in first|admin only|401|403/i.test(msg);
}

export function peekClientList() {
  return cached;
}

export function applyClientList(result: ClientsList) {
  cached = result;
  return result;
}

export function upsertCachedClient(client: ClientsList["clients"][number]) {
  if (!cached || !client?.id) return client;
  const clients = cached.clients.some((row) => row.id === client.id)
    ? cached.clients.map((row) => (row.id === client.id ? client : row))
    : [...cached.clients, client].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  cached = {
    ...cached,
    clients,
    live: clients.filter((row) => row.status === "LIVE").length,
    paper: clients.filter((row) => row.status !== "LIVE").length,
  };
  return client;
}

export function refreshClientList() {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      try {
        return applyClientList(await listClients());
      } catch (error) {
        if (!isAuthMiss(error)) throw error;
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        return applyClientList(await listClients());
      }
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function loadClientList(force = false) {
  if (cached && !force) {
    void refreshClientList();
    return Promise.resolve(cached);
  }
  return refreshClientList();
}
