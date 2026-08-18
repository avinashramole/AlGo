import { useMarket } from "../../context/MarketContext";
import { formatNumber } from "../../lib/format";

function FlowBar({ label, buy, sell, net }: { label: string; buy: number; sell: number; net: number }) {
  const total = buy + sell;
  const buyPct = (buy / total) * 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold">{label}</span>
        <span className="font-bold text-up">+{formatNumber(net, 0)} Cr</span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className="bg-up" style={{ width: `${buyPct}%` }} />
        <div className="bg-down" style={{ width: `${100 - buyPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-400">
        <span>Buy {formatNumber(buy, 0)} Cr</span>
        <span>Sell {formatNumber(sell, 0)} Cr</span>
      </div>
    </div>
  );
}

export function InstitutionalFlow() {
  const { data } = useMarket();
  const combined = data.fiiDii.fii.net + data.fiiDii.dii.net;
  return (
    <section className="card p-4">
      <div className="mb-3 text-sm font-bold">FII / DII Activity</div>
      <div className="space-y-4">
        <FlowBar label="FII" {...data.fiiDii.fii} />
        <FlowBar label="DII" {...data.fiiDii.dii} />
      </div>
      <div className="mt-4 rounded-lg bg-[var(--bg)] px-3 py-2 text-xs text-slate-500">
        Combined net inflow <span className="font-bold text-up">+{formatNumber(combined, 0)} Cr</span> today
      </div>
    </section>
  );
}
