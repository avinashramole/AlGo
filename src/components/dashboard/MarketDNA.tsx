import { useMarket } from "../../context/MarketContext";
import { DeskTape, TapeCell } from "./DeskTape";

export function MarketDNA() {
  const { data } = useMarket();
  return (
    <DeskTape kicker="Structure" extra="Market DNA" testId="market-dna">
      {(data.dnaScores.length ? data.dnaScores : [{ label: "Tape", value: 0 }]).map((item) => (
        <TapeCell key={item.label} title={item.label} value={`${item.value}%`} />
      ))}
    </DeskTape>
  );
}
