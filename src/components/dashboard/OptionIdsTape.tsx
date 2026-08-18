import { useMemo, useState } from "react";
import { useMarket } from "../../context/MarketContext";
import { cn, formatNumber, formatOi, formatPct } from "../../lib/format";

export function OptionIdsTape() {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const symbol = meta?.symbol || "NIFTY";
  const expiries = (meta?.expiries || []).slice(0, 4);
  const rows = data.optionChain || [];
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [strikeQuery, setStrikeQuery] = useState("");
  const [range, setRange] = useState<"atm" | "all">("atm");

  const visible = useMemo(() => {
    const wanted = strikeQuery.trim();
    let next = rows;
    if (range === "atm") {
      const atmIndex = next.findIndex((row) => row.atm);
      if (atmIndex >= 0) next = next.slice(Math.max(0, atmIndex - 8), atmIndex + 9);
    }
    if (wanted) next = next.filter((row) => String(row.strike).includes(wanted));
    return next;
  }, [rows, range, strikeQuery]);

  const lot = meta?.underlyings?.find((item) => item.id === symbol)?.lot || 65;

  const trade = async (option: "CE" | "PE", side: "BUY" | "SELL", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${option}-${side}`;
    setBusy(key);
    setNote("");
    try {
      const result = await order({
        symbol: `${symbol} ${row.strike} ${option}`,
        side,
        qty: lot,
        lots: 1,
        price: option === "CE" ? row.callLtp : row.putLtp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        exchangeSegment: String(symbol).toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      setNote(
        result.live
          ? `Sent to Dhan · ${side} ${symbol} ${row.strike} ${option}`
          : result.warning || `Desk fill · ${side} ${symbol} ${row.strike} ${option}`,
      );
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-sm font-bold">Index options · next 4 expiries</div>
          <p className="text-xs text-slate-400">
            Strike in the centre. CE left, PE right · LTP, buyers, sellers, %, VWAP, volume. BUY/SELL is 1 lot MIS.
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
          <input
            className="h-8 w-24 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            placeholder="Strike"
            value={strikeQuery}
            onChange={(event) => setStrikeQuery(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setRange((value) => (value === "atm" ? "all" : "atm"))}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold"
          >
            {range === "atm" ? "ATM" : `All ${rows.length}`}
          </button>
        </div>
      </div>
      {note ? <div className="mb-2 text-xs font-semibold text-slate-500">{note}</div> : null}
      <table className="w-full min-w-[1180px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-slate-400">
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
            <th className="pb-2 font-semibold">LTP</th>
            <th className="pb-2 font-semibold">Buyers</th>
            <th className="pb-2 font-semibold">Sellers</th>
            <th className="pb-2 font-semibold">%</th>
            <th className="pb-2 font-semibold">VWAP</th>
            <th className="pb-2 font-semibold">Vol</th>
            <th className="pb-2 font-semibold">Trade</th>
            <th className="pb-2 text-center font-semibold">Strike</th>
            <th className="pb-2 text-right font-semibold">Trade</th>
            <th className="pb-2 text-right font-semibold">LTP</th>
            <th className="pb-2 text-right font-semibold">Buyers</th>
            <th className="pb-2 text-right font-semibold">Sellers</th>
            <th className="pb-2 text-right font-semibold">%</th>
            <th className="pb-2 text-right font-semibold">VWAP</th>
            <th className="pb-2 text-right font-semibold">Vol</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
              <td className="py-2 font-bold text-up">{formatNumber(row.callLtp)}</td>
              <td className="py-2">{formatOi(row.callBuy || 0)}</td>
              <td className="py-2">{formatOi(row.callSell || 0)}</td>
              <td className={cn("py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
              <td className="py-2">{formatNumber(row.callVwap || row.callLtp)}</td>
              <td className="py-2">{formatOi(row.callVol || 0)}</td>
              <td className="py-2">
                <MiniTrade busy={busy} id={`${row.strike}-CE`} onBuy={() => void trade("CE", "BUY", row)} onSell={() => void trade("CE", "SELL", row)} />
              </td>
              <td className="py-2 text-center">
                <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                  {row.strike}
                  {row.atm ? " ATM" : ""}
                </div>
              </td>
              <td className="py-2 text-right">
                <div className="flex justify-end">
                  <MiniTrade busy={busy} id={`${row.strike}-PE`} onBuy={() => void trade("PE", "BUY", row)} onSell={() => void trade("PE", "SELL", row)} />
                </div>
              </td>
              <td className="py-2 text-right font-bold text-down">{formatNumber(row.putLtp)}</td>
              <td className="py-2 text-right">{formatOi(row.putBuy || 0)}</td>
              <td className="py-2 text-right">{formatOi(row.putSell || 0)}</td>
              <td className={cn("py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
              <td className="py-2 text-right">{formatNumber(row.putVwap || row.putLtp)}</td>
              <td className="py-2 text-right">{formatOi(row.putVol || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function MiniTrade({
  busy,
  id,
  onBuy,
  onSell,
}: {
  busy: string;
  id: string;
  onBuy: () => void;
  onSell: () => void;
}) {
  return (
    <div className="inline-flex gap-1">
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onBuy}
        className="h-7 rounded-md bg-emerald-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${id}-BUY` ? "..." : "BUY"}
      </button>
      <button
        type="button"
        disabled={Boolean(busy)}
        onClick={onSell}
        className="h-7 rounded-md bg-rose-500 px-2 text-[10px] font-bold text-white disabled:opacity-50"
      >
        {busy === `${id}-SELL` ? "..." : "SELL"}
      </button>
    </div>
  );
}
