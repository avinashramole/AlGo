import { useNavigate } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { DeskTape, TapeCell } from "./DeskTape";

export function RecentSignals() {
  const { data } = useMarket();
  const navigate = useNavigate();
  return (
    <DeskTape kicker="Signals" extra="Tap → Algo" testId="recent-signals">
      {!data.signals.length ? <TapeCell title="Recent" value="—" detail="No live signals yet" onClick={() => navigate("/algo")} /> : null}
      {data.signals.map((signal) => (
        <TapeCell
          key={signal.id}
          title={signal.action}
          value={signal.symbol}
          detail={`${signal.strategy} · ${signal.time} · ${signal.confidence}%`}
          tone={signal.action === "SELL" ? "text-down" : "text-up"}
          onClick={() => navigate("/algo")}
        />
      ))}
    </DeskTape>
  );
}
