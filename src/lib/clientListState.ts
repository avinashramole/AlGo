export type CachedClient = {
  id: string;
  name?: string;
  status?: string;
};

export type CachedClientList<T extends CachedClient = CachedClient> = {
  clients: T[];
  live?: number;
  paper?: number;
};

export function shouldApplyFetchedList(startedEpoch: number, currentEpoch: number) {
  return startedEpoch === currentEpoch;
}

export function mergeClientIntoList<T extends CachedClient, L extends CachedClientList<T>>(
  cached: L | null,
  client: T,
): L | CachedClientList<T> | null {
  if (!client?.id) return cached;
  if (!cached) {
    return {
      clients: [client],
      live: client.status === "LIVE" ? 1 : 0,
      paper: client.status === "LIVE" ? 0 : 1,
    };
  }
  const clients = cached.clients.some((row) => row.id === client.id)
    ? cached.clients.map((row) => (row.id === client.id ? client : row))
    : [...cached.clients, client].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return {
    ...cached,
    clients,
    live: clients.filter((row) => row.status === "LIVE").length,
    paper: clients.filter((row) => row.status !== "LIVE").length,
  };
}
