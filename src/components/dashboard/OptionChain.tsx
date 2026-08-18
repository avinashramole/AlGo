import { useState } from "react";
import { Link } from "react-router-dom";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatPct } from "../../lib/format";

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
      const securityId = option === "CE" ? row.callId : row.putId;
      await order({
        symbol: `${data.optionMeta?.symbol || "NIFTY"} ${row.strike} ${option}`,
        side: action,
        qty: lot,
        price: option === "CE" ? row.callLtp : row.putLtp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: data.optionMeta?.expiry,
        securityId: securityId ? String(securityId) : undefined,
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
                <div className="font-semibold">{formatNumber(row.callLtp)}</div>
                <div className={cn("text-[10px]", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</div>
                <MiniTrade
                  busy={busy}
                  id={`${row.strike}-CE`}
                  onBuy={() => void trade("CE", "BUY", row)}
                  onSell={() => void trade("CE", "SELL", row)}
                />
              </td>
              <td className="py-2.5 text-center">
                <div className="inline-flex rounded-md bg-[var(--bg)] px-2 py-1 font-bold">{row.strike}</div>
              </td>
              <td className="py-2.5 text-right">
                <div className="font-semibold">{formatNumber(row.putLtp)}</div>
                <div className={cn("text-[10px]", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</div>
                <div className="flex justify-end">
                  <MiniTrade
                    busy={busy}
                    id={`${row.strike}-PE`}
                    onBuy={() => void trade("PE", "BUY", row)}
                    onSell={() => void trade("PE", "SELL", row)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MiniTrade({ busy, id, onBuy, onSell }: { busy: string; id: string; onBuy: () => void; onSell: () => void }) {
  return (
    <div className="mt-1 inline-flex gap-1">
      <button type="button" disabled={Boolean(busy)} onClick={onBuy} className="h-5 rounded bg-emerald-500 px-1.5 text-[9px] font-bold text-white disabled:opacity-50">
        {busy === `${id}-BUY` ? "..." : "BUY"}
      </button>
      <button type="button" disabled={Boolean(busy)} onClick={onSell} className="h-5 rounded bg-rose-500 px-1.5 text-[9px] font-bold text-white disabled:opacity-50">
        {busy === `${id}-SELL` ? "..." : "SELL"}
      </button>
    </div>
  );
}
