import { useMarket } from "../../context/MarketContext";
import { DeskTape, TapeCell } from "./DeskTape";

type Props = {
  onReview: () => void;
};

export function AISignal({ onReview }: Props) {
  const { data } = useMarket();
  const signal = data.featuredSignal;
  const live = Boolean(signal.symbol);
  return (
    <DeskTape kicker="Execution" extra="AI Signal" testId="ai-signal">
      <TapeCell title="Action" value={live ? signal.action : "WAIT"} tone={signal.action === "SELL" ? "text-down" : "text-up"} />
      <TapeCell title="Contract" value={live ? signal.symbol : "—"} detail={live ? `${signal.strategy} · ${signal.expiry}` : "Start an algo or wait for a Dhan fill"} />
      <TapeCell title="Confidence" value={`${signal.confidence}%`} detail={`Risk ${signal.risk || "—"}`} />
      {(signal.metrics || []).map((item) => (
        <TapeCell key={item.label} title={item.label} value={`${item.value}%`} />
      ))}
      <TapeCell title="Trade" value={live ? "Review" : "Wait"} detail={live ? "Open ticket" : "No live signal"} onClick={() => live && onReview()} disabled={!live} />
    </DeskTape>
  );
}
