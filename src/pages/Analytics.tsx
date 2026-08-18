import { useMarket } from "../context/MarketContext";

export function Analytics() {
  const { data } = useMarket();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Analytics</h1>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-4 text-sm font-bold">Strategy contribution</div>
          <div className="space-y-3">
            {data.algos.map((algo, i) => {
              const colors = ["#2f54eb", "#12b76a", "#f79009"];
              const pct = Math.max(8, Math.round((Math.abs(algo.pnl) / 7000) * 100));
              return (
                <div key={algo.id}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-semibold">{algo.name}</span>
                    <span className="text-slate-400">{pct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-4 text-sm font-bold">Market DNA snapshot</div>
          <div className="space-y-2">
            {data.dnaScores.map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-lg bg-[var(--bg)] px-3 py-2 text-sm">
                <span>{item.label}</span>
                <span className="font-bold">{item.value}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
