import { useNavigate } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { DeskTape, TapeCell } from "../components/dashboard/DeskTape";
import { isRetiredDeskStrategy } from "../lib/strategies";

export function Analytics() {
  const { data } = useMarket();
  const navigate = useNavigate();
  const algos = data.algos.filter((algo) => !isRetiredDeskStrategy(algo));
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Analytics</h1>
      <DeskTape kicker="Strategy" extra="Tap → Algo" testId="strategy-contrib">
        {!algos.length ? <TapeCell title="Contribution" value="—" detail="No live strategies" /> : null}
        {algos.map((algo) => {
          const pct = Math.max(8, Math.round((Math.abs(algo.pnl) / 7000) * 100));
          return (
            <TapeCell
              key={algo.id}
              title={algo.name}
              value={`${pct}%`}
              detail={algo.enabled ? "LIVE" : "PAUSED"}
              onClick={() => navigate("/algo")}
            />
          );
        })}
      </DeskTape>
      <DeskTape kicker="Structure" extra="Market DNA" testId="analytics-dna">
        {data.dnaScores.map((item) => (
          <TapeCell key={item.label} title={item.label} value={`${item.value}%`} />
        ))}
      </DeskTape>
    </div>
  );
}
