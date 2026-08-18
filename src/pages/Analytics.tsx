import { dnaScores } from "../data/mock";

export function Analytics() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Analytics</h1>
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-4 text-sm font-bold">Strategy contribution</div>
          <div className="space-y-3">
            {[
              { name: "VWAP Depth", pct: 42, color: "#2f54eb" },
              { name: "Momentum Rider", pct: 29, color: "#12b76a" },
              { name: "ORB Breakout", pct: 18, color: "#f79009" },
              { name: "Vol Crush", pct: 11, color: "#7a5af8" },
            ].map((item) => (
              <div key={item.name}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-semibold">{item.name}</span>
                  <span className="text-slate-400">{item.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-2 rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section className="card p-4">
          <div className="mb-4 text-sm font-bold">Market DNA snapshot</div>
          <div className="space-y-2">
            {dnaScores.map((item) => (
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
