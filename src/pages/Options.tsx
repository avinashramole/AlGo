import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FuturesTape } from "../components/dashboard/FuturesTape";
import { OptionIdsTape } from "../components/dashboard/OptionIdsTape";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, formatOi, formatPct } from "../lib/format";

export function Options() {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
  ];
  const rows = data.optionChain || [];
  const [busy, setBusy] = useState("");
  const [lots, setLots] = useState(1);
  const [note, setNote] = useState("");
  const visibleRows = useMemo(() => {
    const atmIndex = rows.findIndex((row) => row.atm);
    if (atmIndex < 0) return rows.slice(0, 21);
    return rows.slice(Math.max(0, atmIndex - 10), atmIndex + 11);
  }, [rows]);
  const maxOi = Math.max(1, ...visibleRows.map((row) => Math.max(row.callOi || 0, row.putOi || 0)));

  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const pcrText = meta?.pcr != null ? meta.pcr.toFixed(2) : "—";
  const atmIvText = meta?.atmIv ? `${meta.atmIv.toFixed(1)}%` : "—";
  const lotSize = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lotSize;

  const trade = async (option: "CE" | "PE", action: "BUY" | "SELL", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${option}-${action}`;
    setBusy(key);
    setNote("");
    try {
      const ltp = option === "CE" ? row.callLtp : row.putLtp;
      const symbol = `${meta?.symbol || "NIFTY"} ${row.strike} ${option}`;
      const result = await order({
        symbol,
        side: action,
        qty,
        price: ltp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        exchangeSegment: String(meta?.symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      if (result.live) {
        setNote(`Sent to Dhan · ${action} ${symbol} · ${lots} lot × ${lotSize} = ${qty} qty · see Order book`);
      } else {
        setNote(
          result.warning ||
            `Desk fill only · ${action} ${symbol} · ${lots} lot × ${lotSize} = ${qty} qty @ ${formatNumber(ltp)}`,
        );
      }
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  const sourceLabel = meta?.source === "dhan" ? "DHAN LIVE" : data.dhanFeed?.live ? "DHAN · DEMO FALLBACK" : "DEMO";
  const expiryLabel = meta?.expiryLabel || meta?.expiry || "—";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Option Chain</h1>
          <p className="text-sm text-slate-400">
            {meta?.symbol || "NIFTY"} · Expiry {expiryLabel} · Spot {formatNumber(spot)} · ATM ±10 · {sourceLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {underlyings.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void selectChain(item.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-semibold",
                meta?.symbol === item.id ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)]",
              )}
            >
              {item.label} · {item.lot}
            </button>
          ))}
          <select
            className="h-8 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 text-xs font-semibold"
            value={meta?.expiry || ""}
            onChange={(event) => void selectChain(meta?.symbol || "NIFTY", event.target.value)}
          >
            {(meta?.expiries || []).map((expiry) => (
              <option key={expiry} value={expiry}>
                {meta?.expiryLabels?.[expiry] || expiry}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs font-semibold">
            Lots
            <input
              className="h-7 w-14 rounded border border-[var(--border)] bg-[var(--bg)] px-2 font-bold"
              type="number"
              min={1}
              value={lots}
              onChange={(event) => setLots(Math.max(1, Number(event.target.value) || 1))}
            />
            <span className="text-slate-400">
              1 lot = {lotSize} · qty {qty}
            </span>
          </label>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Spot" value={formatNumber(spot)} />
        <Stat label="ATM" value={atm ? String(atm.strike) : "—"} />
        <Stat label="PCR" value={pcrText} />
        <Stat label="Max pain" value={meta?.maxPain ? formatNumber(meta.maxPain, 0) : "—"} />
        <Stat label="ATM IV" value={atmIvText} />
      </div>
      <div
        className={cn(
          "rounded-xl px-4 py-2 text-sm font-semibold",
          data.dhanFeed?.live ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
        )}
      >
        {data.dhanFeed?.live ? (
          <>
            BUY/SELL goes to Dhan. The desk looks up the live contract on the server. Confirm in the{" "}
            <Link to="/orders" className="underline">
              order book
            </Link>{" "}
            and the Dhan app. Order APIs need a static IP whitelist at Dhan.
          </>
        ) : (
          <>
            Desk fill only until Dhan is LIVE. Paste Access Token on{" "}
            <Link to="/brokers" className="underline">
              Brokers
            </Link>
            , then BUY/SELL again.
          </>
        )}
      </div>
      {note ? <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold">{note}</div> : null}
      <FuturesTape />
      <OptionIdsTape />
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-xs">
          <thead className="bg-[var(--bg)] text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th colSpan={6} className="px-3 py-2 text-center font-bold text-up">
                CALLS
              </th>
              <th className="px-3 py-2 text-center font-bold">Strike</th>
              <th colSpan={6} className="px-3 py-2 text-center font-bold text-down">
                PUTS
              </th>
            </tr>
            <tr>
              <th className="px-3 py-2 font-semibold">OI</th>
              <th className="px-3 py-2 font-semibold">IV</th>
              <th className="px-3 py-2 font-semibold">Buy</th>
              <th className="px-3 py-2 font-semibold">LTP</th>
              <th className="px-3 py-2 font-semibold">Sell</th>
              <th className="px-3 py-2 font-semibold">Chg</th>
              <th className="px-3 py-2 text-center font-semibold">Strike</th>
              <th className="px-3 py-2 text-right font-semibold">Chg</th>
              <th className="px-3 py-2 text-right font-semibold">Buy</th>
              <th className="px-3 py-2 text-right font-semibold">LTP</th>
              <th className="px-3 py-2 text-right font-semibold">Sell</th>
              <th className="px-3 py-2 text-right font-semibold">IV</th>
              <th className="px-3 py-2 text-right font-semibold">OI</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
                <td className="px-3 py-2">
                  <OiBar value={row.callOi || 0} max={maxOi} side="call" />
                  <div className="font-semibold">{formatOi(row.callOi || 0)}</div>
                </td>
                <td className="px-3 py-2">{row.callIv ? `${row.callIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2">
                  <TradeButton busy={busy} strike={row.strike} option="CE" side="BUY" onTrade={() => void trade("CE", "BUY", row)} />
                </td>
                <td className="px-3 py-2 font-bold text-up">{formatNumber(row.callLtp)}</td>
                <td className="px-3 py-2">
                  <TradeButton busy={busy} strike={row.strike} option="CE" side="SELL" onTrade={() => void trade("CE", "SELL", row)} />
                </td>
                <td className={cn("px-3 py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
                <td className="px-3 py-2 text-center">
                  <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                    {row.strike}
                    {row.atm ? " ATM" : ""}
                  </div>
                </td>
                <td className={cn("px-3 py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <TradeButton busy={busy} strike={row.strike} option="PE" side="BUY" onTrade={() => void trade("PE", "BUY", row)} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-bold text-down">{formatNumber(row.putLtp)}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end">
                    <TradeButton busy={busy} strike={row.strike} option="PE" side="SELL" onTrade={() => void trade("PE", "SELL", row)} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{row.putIv ? `${row.putIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="font-semibold">{formatOi(row.putOi || 0)}</div>
                  <OiBar value={row.putOi || 0} max={maxOi} side="put" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-slate-400">
        Buy / Sell is a MIS market order for {lots} lot ({qty} qty). This page shows ATM ±10 strikes only. The desk
        looks up the Dhan contract on the server. Orders reach Dhan only while the live Access Token is connected.
      </p>
    </div>
  );
}

function TradeButton({
  busy,
  strike,
  option,
  side,
  onTrade,
}: {
  busy: string;
  strike: number;
  option: "CE" | "PE";
  side: "BUY" | "SELL";
  onTrade: () => void;
}) {
  return (
    <button
      type="button"
      disabled={Boolean(busy)}
      onClick={onTrade}
      className={cn(
        "h-7 rounded-md px-2 text-[10px] font-bold text-white disabled:opacity-50",
        side === "BUY" ? "bg-emerald-500" : "bg-rose-500",
      )}
    >
      {busy === `${strike}-${option}-${side}` ? "..." : side}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function OiBar({ value, max, side }: { value: number; max: number; side: "call" | "put" }) {
  const width = Math.max(8, Math.round((value / max) * 100));
  return (
    <div className="mb-1 h-1.5 w-full overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
      <div className={cn("h-full rounded", side === "call" ? "bg-emerald-400" : "ml-auto bg-rose-400")} style={{ width: `${width}%` }} />
    </div>
  );
}
