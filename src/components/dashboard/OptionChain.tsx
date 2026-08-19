import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatPct, vwapTone } from "../../lib/format";

export function OptionChain() {
  const { data, order } = useMarket();
  const [busy, setBusy] = useState("");
  const rows = (data.optionChain || []).filter((_row, index, list) => {
    const atm = list.findIndex((item) => item.atm);
    if (atm < 0) return index < 5;
    return Math.abs(index - atm) <= 2;
  });
  const spot = data.optionMeta?.spot || data.indices[0]?.price || 0;
  const lot = data.optionMeta?.underlyings?.find((item) => item.id === data.optionMeta?.symbol)?.lot || 65;

  const trade = async (option: "CE" | "PE", action: "BUY" | "SELL", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${option}-${action}`;
    setBusy(key);
    try {
      await order({
        symbol: `${data.optionMeta?.symbol || "NIFTY"} ${row.strike} ${option}`,
        side: action,
        qty: lot,
        price: option === "CE" ? row.callLtp : row.putLtp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        kind: "option",
        option,
        strike: row.strike,
        expiry: data.optionMeta?.expiry,
        exchangeSegment: String(data.optionMeta?.symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card overflow-hidden p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold">Option Chain</div>
        <Link to="/options" className="text-[11px] font-semibold text-brand-500">
          {data.optionMeta?.symbol || "NIFTY"} · {data.optionMeta?.expiryLabel || data.optionMeta?.expiry || "expiry"} · Spot{" "}
          {formatNumber(spot, 0)} →
        </Link>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
          <tr>
            <th className="pb-2 font-semibold">Call</th>
            <th className="pb-2 text-center font-semibold">Strike</th>
            <th className="pb-2 text-right font-semibold">Put</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/70 dark:bg-brand-500/10")}>
              <td className="py-2.5">
                <div className="inline-flex items-center gap-1">
                  <MiniButton busy={busy} id={`${row.strike}-CE`} side="BUY" onClick={() => void trade("CE", "BUY", row)} />
                  <span className={cn("text-[10px] font-semibold", vwapTone(row.callVwap || row.callLtp, row.callLtp))}>
                    {formatNumber(row.callVwap || row.callLtp)}
                  </span>
                  <span className="font-semibold">{formatNumber(row.callLtp)}</span>
                  <MiniButton busy={busy} id={`${row.strike}-CE`} side="SELL" onClick={() => void trade("CE", "SELL", row)} />
                </div>
                <div className={cn("text-[10px]", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</div>
              </td>
              <td className="py-2.5 text-center">
                <div className="inline-flex rounded-md bg-[var(--bg)] px-2 py-1 font-bold">{row.strike}</div>
              </td>
              <td className="py-2.5 text-right">
                <div className="inline-flex items-center justify-end gap-1">
                  <MiniButton busy={busy} id={`${row.strike}-PE`} side="BUY" onClick={() => void trade("PE", "BUY", row)} />
                  <span className={cn("text-[10px] font-semibold", vwapTone(row.putVwap || row.putLtp, row.putLtp))}>
                    {formatNumber(row.putVwap || row.putLtp)}
                  </span>
                  <span className="font-semibold">{formatNumber(row.putLtp)}</span>
                  <MiniButton busy={busy} id={`${row.strike}-PE`} side="SELL" onClick={() => void trade("PE", "SELL", row)} />
                </div>
                <div className={cn("text-[10px]", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MiniButton({
  busy,
  id,
  side,
  onClick,
}: {
  busy: string;
  id: string;
  side: "BUY" | "SELL";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={onClick}
      className={cn(
        "h-8 min-w-[2.5rem] rounded px-2 text-[10px] font-bold text-white disabled:opacity-50 md:h-5 md:min-w-0 md:px-1.5 md:text-[9px]",
        side === "BUY" ? "bg-emerald-500" : "bg-rose-500",
      )}
    >
      {busy === `${id}-${side}` ? "..." : side}
    </button>
  );
}
