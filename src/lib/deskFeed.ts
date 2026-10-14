type StrikeRow = { strike: number };
type IdRow = { id: string };
type BookRow = IdRow & {
  symbol?: string;
  securityId?: string;
  product?: string;
  paper?: boolean;
  brokerId?: string;
  live?: boolean;
  copyUserId?: string;
  qty?: number;
};

function isLiveBrokerRow(row: BookRow) {
  if (row.paper || row.brokerId === "paper") return false;
  if (row.copyUserId) return false;
  return Boolean(row.live || row.brokerId === "dhan" || String(row.id || "").startsWith("dhan-pos-"));
}

function contractKey(row: BookRow) {
  const securityId = String(row.securityId || "").trim();
  if (securityId && securityId !== "0") return `sid:${securityId}`;
  const symbol = String(row.symbol || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  return symbol ? `sym:${symbol}` : "";
}

function preferLiveRow<T extends BookRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftId = String(left.id || "");
    const rightId = String(right.id || "");
    const leftIntraday = /INTRADAY|MIS/i.test(String(left.product || leftId));
    const rightIntraday = /INTRADAY|MIS/i.test(String(right.product || rightId));
    if (leftIntraday !== rightIntraday) return leftIntraday ? -1 : 1;
    return Math.abs(Number(right.qty) || 0) - Math.abs(Number(left.qty) || 0);
  })[0];
}

/** One open lot per Dhan contract. Product-alias ids must not count as 4 Crude positions. */
export function uniqueOpenContracts<T extends BookRow>(rows: T[] = []): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows || []) {
    const key = contractKey(row) || `id:${row.id}`;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  return [...groups.values()].map((list) => preferLiveRow(list));
}

/** Empty feed poll can keep the last book. A full snapshot with [] means the lot is closed. */
export function keepLivePositionBook<T extends BookRow>(
  previous: T[] = [],
  incoming: T[] = [],
  { trustEmpty = false } = {},
): T[] {
  const prev = Array.isArray(previous) ? previous : [];
  const next = uniqueOpenContracts(Array.isArray(incoming) ? incoming : []);
  if (!next.length) {
    if (trustEmpty) return prev.filter((row) => !isLiveBrokerRow(row));
    return uniqueOpenContracts(prev);
  }
  const incomingIds = new Set(next.map((row) => String(row.id)));
  const incomingKeys = new Set(next.map(contractKey).filter(Boolean));
  const extras = prev.filter((row) => {
    if (incomingIds.has(String(row.id))) return false;
    if (isLiveBrokerRow(row)) return false;
    const key = contractKey(row);
    if (key && incomingKeys.has(key)) return false;
    return true;
  });
  return [...next, ...extras];
}

export function dropClosedLivePosition<T extends BookRow>(rows: T[] = [], closed: BookRow = { id: "" }): T[] {
  const id = String(closed.id || "").trim();
  const key = contractKey(closed);
  return (rows || []).filter((row) => {
    if (id && String(row.id) === id) return false;
    const rowKey = contractKey(row);
    if (key && rowKey && key === rowKey && !row.copyUserId) return false;
    return true;
  });
}

export function keepLastIndexPrices<
  T extends { symbol: string; price?: number; future?: number; change?: number; changePct?: number; prevClose?: number },
>(previous: T[] = [], incoming: T[] = []): T[] {
  if (!incoming.length) return previous;
  if (!previous.length) return incoming;
  const prevBySymbol = new Map(previous.map((row) => [row.symbol, row]));
  return incoming.map((row) => {
    const prev = prevBySymbol.get(row.symbol);
    if (!(Number(row.price) > 0) && !(Number(row.future) > 0)) {
      if (!prev) return row;
      if (!(Number(prev.price) > 0) && !(Number(prev.future) > 0)) return row;
      return {
        ...row,
        ...prev,
        symbol: row.symbol,
        future: Number(row.future) > 0 ? row.future : prev.future,
      };
    }
    const prevClose = Number(row.prevClose) > 0 ? Number(row.prevClose) : Number(prev?.prevClose) || 0;
    if (prevClose > 0 && Number(row.price) > 0 && !(Number(row.change) || Number(row.changePct))) {
      const change = Number((Number(row.price) - prevClose).toFixed(2));
      const changePct = Number(((change / prevClose) * 100).toFixed(2));
      return { ...row, change, changePct, prevClose };
    }
    return row;
  });
}

export function keepStrikeWindow<T extends StrikeRow>(previous: T[] = [], incoming: T[] = []): T[] {
  const prev = Array.isArray(previous) ? previous : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (!prev.length) return next;
  if (!next.length) return prev;
  const byStrike = new Map(next.map((row) => [Number(row.strike), row]));
  const patched: T[] = [];
  for (const row of prev) {
    const fresh = byStrike.get(Number(row.strike));
    if (fresh) patched.push({ ...row, ...fresh });
  }
  if (patched.length >= Math.min(11, prev.length)) return patched;
  return next;
}

export function keepLastBookRows<T extends IdRow>(previous: T[] = [], incoming: T[] = []): T[] {
  const prev = Array.isArray(previous) ? previous : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (!next.length) return prev;
  return patchById(prev, next);
}

export function patchById<T extends IdRow>(previous: T[] = [], incoming: T[] = []): T[] {
  const prev = Array.isArray(previous) ? previous : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (!next.length) return prev;
  if (!prev.length) return next;
  const map = new Map(next.map((row) => [String(row.id), row]));
  if (prev.length === next.length && prev.every((row) => map.has(String(row.id)))) {
    return prev.map((row) => ({ ...row, ...map.get(String(row.id))! }));
  }
  const seen = new Set<string>();
  const merged = prev.map((row) => {
    seen.add(String(row.id));
    const fresh = map.get(String(row.id));
    return fresh ? { ...row, ...fresh } : row;
  });
  for (const row of next) {
    if (!seen.has(String(row.id))) merged.push(row);
  }
  return merged;
}
