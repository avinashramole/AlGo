import { useNavigate } from "react-router-dom";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, formatPct } from "../lib/format";
import { DeskTape, TapeCell } from "../components/dashboard/DeskTape";

export function Markets() {
  const { data } = useMarket();
  const navigate = useNavigate();
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Markets</h1>
      <DeskTape kicker="Watch" extra="Tap → Option Chain" testId="market-watch">
        {(data.marketWatch.length ? data.marketWatch : [{ symbol: "NIFTY 50", ltp: 0, chg: 0, volume: "—" }]).map((row) => (
          <TapeCell
            key={row.symbol}
            title={row.symbol}
            value={formatNumber(row.ltp)}
            detail={`${formatPct(row.chg)} · ${row.volume || "—"}`}
            tone={row.chg >= 0 ? "text-up" : "text-down"}
            className={cn(row.chg < 0 && "text-down")}
            onClick={() => navigate("/options")}
          />
        ))}
      </DeskTape>
    </div>
  );
}
