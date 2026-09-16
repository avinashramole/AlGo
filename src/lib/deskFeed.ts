type StrikeRow = { strike: number };
type IdRow = { id: string };

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
