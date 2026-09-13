import { useMarket } from "../context/MarketContext";

export function Notifications() {
  const { data } = useMarket();
  const items = data.notifications || [];
  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <h1 className="text-xl font-bold">Notifications</h1>
      {!items.length ? (
        <div className="card px-4 py-8 text-center text-sm text-slate-400">
          No live desk alerts yet. Fills, strategy changes, and Dhan notices show here.
        </div>
      ) : null}
      {items.map((item) => (
        <div key={item} className="card px-4 py-3 text-sm">
          {item}
        </div>
      ))}
    </div>
  );
}
