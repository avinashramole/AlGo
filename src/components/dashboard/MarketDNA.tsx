import { useMarket } from "../../context/MarketContext";
import { RadarChart } from "../charts/RadarChart";

export function MarketDNA() {
  const { data } = useMarket();
  return (
    <section className="card p-4">
      <div className="mb-1 text-sm font-bold">Market DNA</div>
      <RadarChart scores={data.dnaScores} />
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {data.dnaScores.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-slate-500">
            <span>{item.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{item.value}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
