import { useMarket } from "../../context/MarketContext";
import { formatNumber } from "../../lib/format";
import { DeskTape, TapeCell } from "./DeskTape";

export function InstitutionalFlow() {
  const { data } = useMarket();
  const combined = data.fiiDii.fii.net + data.fiiDii.dii.net;
  const hasFeed = Boolean(data.fiiDii.fii.buy || data.fiiDii.fii.sell || data.fiiDii.dii.buy || data.fiiDii.dii.sell);
  return (
    <DeskTape kicker="Flow" extra="FII / DII" testId="flow">
      {hasFeed ? (
        <>
          <TapeCell title="FII" value={`${formatNumber(data.fiiDii.fii.net, 0)} Cr`} tone="text-up" detail={`Buy ${formatNumber(data.fiiDii.fii.buy, 0)} · Sell ${formatNumber(data.fiiDii.fii.sell, 0)}`} />
          <TapeCell title="DII" value={`${formatNumber(data.fiiDii.dii.net, 0)} Cr`} tone="text-up" detail={`Buy ${formatNumber(data.fiiDii.dii.buy, 0)} · Sell ${formatNumber(data.fiiDii.dii.sell, 0)}`} />
          <TapeCell title="Combined" value={`${formatNumber(combined, 0)} Cr`} detail="Net inflow today" />
        </>
      ) : (
        <TapeCell title="FII / DII" value="—" detail="No live Dhan feed. Figures stay 0." />
      )}
    </DeskTape>
  );
}
