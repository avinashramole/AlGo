type StrikeRow = { strike: number };
type IdRow = { id: string };

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
