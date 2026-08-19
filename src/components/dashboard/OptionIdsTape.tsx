import { useMemo, useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatOi, formatPct, vwapTone } from "../../lib/format";

export function OptionIdsTape({ lots = 1 }: { lots?: number }) {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const symbol = meta?.symbol || "NIFTY";
  const expiries = (meta?.expiries || []).slice(0, 4);
  const rows = data.optionChain || [];
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [noteFail, setNoteFail] = useState(false);

  const visible = useMemo(() => {
    const atmIndex = rows.findIndex((row) => row.atm);
    const next =
      atmIndex < 0 ? rows.slice(0, 21) : rows.slice(Math.max(0, atmIndex - 10), atmIndex + 11);
    return next;
  }, [rows]);

  const lot = meta?.underlyings?.find((item) => item.id === symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lot;

  const trade = async (option: "CE" | "PE", side: "BUY" | "SELL", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${option}-${side}`;
    setBusy(key);
    setNote("");
    setNoteFail(false);
    try {
      const result = await order({
        symbol: `${symbol} ${row.strike} ${option}`,
        side,
        qty,
        lots: Math.max(1, lots),
        price: option === "CE" ? row.callLtp : row.putLtp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        kind: "option",
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        exchangeSegment: String(symbol).toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      setNote(
        result.live
          ? `${result.afterMarketOrder ? "Queued at Dhan for next open (AMO)" : "Sent to Dhan"} · ${side} ${symbol} ${row.strike} ${option} · ${lots} lot × ${lot} = ${qty} qty`
          : result.warning || `Desk fill · ${side} ${symbol} ${row.strike} ${option} · ${lots} lot × ${lot} = ${qty} qty`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Order failed";
      setNoteFail(true);
      setNote(message);
      window.alert(message);
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card p-3 md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden md:p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 md:shrink-0">
        <div>
          <div className="text-sm font-bold">Index options · next 4 expiries</div>
          <p className="text-xs text-slate-400">
            ATM ±10. On a phone tap BUY/SELL on each strike. On a wide screen the full chain table scrolls sideways.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {expiries.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => void selectChain(symbol, item)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                meta?.expiry === item ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
              )}
            >
              {meta?.expiryLabels?.[item] || item}
            </button>
          ))}
        </div>
      </div>
      {note ? (
        <div className={cn("mb-2 break-words text-xs font-semibold", noteFail ? "text-down" : "text-slate-500")}>{note}</div>
      ) : null}
      <div className="space-y-2 md:hidden">
        {visible.map((row) => (
          <div key={row.strike} className={cn("rounded-xl border border-[var(--border)] p-2", row.atm && "border-brand-500 bg-brand-50/80 dark:bg-brand-500/10")}>
            <div className="mb-2 text-center text-sm font-bold">
              {row.strike}
              {row.atm ? " ATM" : ""}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-1 text-[10px] font-bold uppercase text-up">CE {formatNumber(row.callLtp)}</div>
                <div className="flex gap-1">
                  <SideButton busy={busy} id={`${row.strike}-CE`} side="BUY" onClick={() => void trade("CE", "BUY", row)} />
                  <SideButton busy={busy} id={`${row.strike}-CE`} side="SELL" onClick={() => void trade("CE", "SELL", row)} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-right text-[10px] font-bold uppercase text-down">PE {formatNumber(row.putLtp)}</div>
                <div className="flex justify-end gap-1">
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="BUY" onClick={() => void trade("PE", "BUY", row)} />
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="SELL" onClick={() => void trade("PE", "SELL", row)} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden min-h-0 flex-1 overflow-auto md:block">
        <table className="w-full min-w-[1100px] text-left text-xs">
        <thead className="sticky top-0 z-10 bg-[var(--card)] text-[10px] uppercase tracking-wide text-slate-400 shadow-[inset_0_-1px_0_var(--border)] [&_th]:bg-[var(--card)]">
          <tr>
            <th colSpan={7} className="pb-2 text-center font-bold text-up">
              CE
            </th>
            <th className="pb-2 text-center font-bold">Strike</th>
            <th colSpan={7} className="pb-2 text-center font-bold text-down">
              PE
            </th>
          </tr>
          <tr>
            <th className="pb-2 font-semibold">Buy</th>
            <th className="pb-2 font-semibold">VWAP</th>
            <th className="pb-2 font-semibold">LTP</th>
            <th className="pb-2 font-semibold">Sell</th>
            <th className="pb-2 font-semibold">Buyers</th>
            <th className="pb-2 font-semibold">Sellers</th>
            <th className="pb-2 font-semibold">%</th>
            <th className="pb-2 text-center font-semibold">Strike</th>
            <th className="pb-2 text-right font-semibold">%</th>
            <th className="pb-2 text-right font-semibold">Sellers</th>
            <th className="pb-2 text-right font-semibold">Buyers</th>
            <th className="pb-2 text-right font-semibold">Buy</th>
            <th className="pb-2 text-right font-semibold">VWAP</th>
            <th className="pb-2 text-right font-semibold">LTP</th>
            <th className="pb-2 text-right font-semibold">Sell</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
              <td className="py-2">
                <SideButton busy={busy} id={`${row.strike}-CE`} side="BUY" onClick={() => void trade("CE", "BUY", row)} />
              </td>
              <td className={cn("py-2 font-semibold", vwapTone(row.callVwap || row.callLtp, row.callLtp))}>
                {formatNumber(row.callVwap || row.callLtp)}
              </td>
              <td className="py-2 font-bold text-up">{formatNumber(row.callLtp)}</td>
              <td className="py-2">
                <SideButton busy={busy} id={`${row.strike}-CE`} side="SELL" onClick={() => void trade("CE", "SELL", row)} />
              </td>
              <td className="py-2">{formatOi(row.callBuy || 0)}</td>
              <td className="py-2">{formatOi(row.callSell || 0)}</td>
              <td className={cn("py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
              <td className="py-2 text-center">
                <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                  {row.strike}
                  {row.atm ? " ATM" : ""}
                </div>
              </td>
              <td className={cn("py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
              <td className="py-2 text-right">{formatOi(row.putSell || 0)}</td>
              <td className="py-2 text-right">{formatOi(row.putBuy || 0)}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end">
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="BUY" onClick={() => void trade("PE", "BUY", row)} />
                </div>
              </td>
              <td className={cn("py-2 text-right font-semibold", vwapTone(row.putVwap || row.putLtp, row.putLtp))}>
                {formatNumber(row.putVwap || row.putLtp)}
              </td>
              <td className="py-2 text-right font-bold text-down">{formatNumber(row.putLtp)}</td>
              <td className="py-2 text-right">
                <div className="flex justify-end">
                  <SideButton busy={busy} id={`${row.strike}-PE`} side="SELL" onClick={() => void trade("PE", "SELL", row)} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
        </table>
      </div>
    </section>
  );
}

function SideButton({
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
        "h-10 min-w-[3.25rem] flex-1 rounded-md px-2 text-xs font-bold text-white disabled:opacity-50 md:h-7 md:min-w-0 md:flex-none md:text-[10px]",
        side === "BUY" ? "bg-emerald-500" : "bg-rose-500",
      )}
    >
      {busy === `${id}-${side}` ? "..." : side}
    </button>
  );
}
