import { useMarket } from "../../context/MarketContext";
import { hasDhanQuotes } from "../../lib/format";
import { DeskTape, TapeCell } from "./DeskTape";

export function SentimentGauge() {
  const { data } = useMarket();
  const bullish = data.sentiment >= 55;
  return (
    <DeskTape kicker="Sentiment" extra={hasDhanQuotes(data) ? "Live tape" : "Desk tape"} testId="sentiment">
      <TapeCell title="Score" value={`${data.sentiment}%`} tone={bullish ? "text-up" : "text-down"} detail={bullish ? "BULLISH" : "BEARISH"} />
      <TapeCell title="Source" value={hasDhanQuotes(data) ? "DHAN" : "DESK"} detail="Index + option pressure" />
    </DeskTape>
  );
}
