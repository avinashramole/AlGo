import { useState } from "react";
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
  const maxOi = Math.max(1, ...rows.map((row) => Math.max(row.callOi || 0, row.putOi || 0)));
  const [busy, setBusy] = useState("");

  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const pcrText = meta?.pcr != null ? meta.pcr.toFixed(2) : "—";
  const atmIvText = meta?.atmIv ? `${meta.atmIv.toFixed(1)}%` : "—";

  const trade = async (side: "CE" | "PE", row: (typeof rows)[number]) => {
    const key = `${row.strike}-${side}`;
    setBusy(key);
    try {
      const ltp = side === "CE" ? row.callLtp : row.putLtp;
      await order({
        symbol: `${meta?.symbol || "NIFTY"} ${row.strike} ${side}`,
        side: "BUY",
        qty: underlyings.find((item) => item.id === meta?.symbol)?.lot || 65,
        price: ltp,
        brokerId: data.activeBrokerId,
      });
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
            {meta?.symbol || "NIFTY"} · Expiry {expiryLabel} · Spot {formatNumber(spot)} · {sourceLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Spot" value={formatNumber(spot)} />
        <Stat label="ATM" value={atm ? String(atm.strike) : "—"} />
        <Stat label="PCR" value={pcrText} />
        <Stat label="Max pain" value={meta?.maxPain ? formatNumber(meta.maxPain, 0) : "—"} />
        <Stat label="ATM IV" value={atmIvText} />
      </div>
      <section className="card overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="bg-[var(--bg)] text-[10px] uppercase tracking-wide text-slate-400">
            <tr>
              <th colSpan={5} className="px-3 py-2 text-center font-bold text-up">
                CALLS
              </th>
              <th className="px-3 py-2 text-center font-bold">Strike</th>
              <th colSpan={5} className="px-3 py-2 text-center font-bold text-down">
                PUTS
              </th>
            </tr>
            <tr>
              <th className="px-3 py-2 font-semibold">OI</th>
              <th className="px-3 py-2 font-semibold">Volume</th>
              <th className="px-3 py-2 font-semibold">IV</th>
              <th className="px-3 py-2 font-semibold">LTP</th>
              <th className="px-3 py-2 font-semibold">Chg</th>
              <th className="px-3 py-2 text-center font-semibold">Strike</th>
              <th className="px-3 py-2 text-right font-semibold">Chg</th>
              <th className="px-3 py-2 text-right font-semibold">LTP</th>
              <th className="px-3 py-2 text-right font-semibold">IV</th>
              <th className="px-3 py-2 text-right font-semibold">Volume</th>
              <th className="px-3 py-2 text-right font-semibold">OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.strike} className={cn("soft-row", row.atm && "bg-brand-50/80 dark:bg-brand-500/10")}>
                <td className="px-3 py-2">
                  <OiBar value={row.callOi || 0} max={maxOi} side="call" />
                  <div className="font-semibold">{formatOi(row.callOi || 0)}</div>
                </td>
                <td className="px-3 py-2 text-slate-500">{formatOi(row.callVol || 0)}</td>
                <td className="px-3 py-2">{row.callIv ? `${row.callIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void trade("CE", row)}
                    className="font-bold text-up hover:underline"
                    title="Buy call"
                  >
                    {formatNumber(row.callLtp)}
                  </button>
                </td>
                <td className={cn("px-3 py-2", row.callChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.callChg)}</td>
                <td className="px-3 py-2 text-center">
                  <div className={cn("inline-flex rounded-md px-2 py-1 font-bold", row.atm ? "bg-brand-500 text-white" : "bg-[var(--bg)]")}>
                    {row.strike}
                    {row.atm ? " ATM" : ""}
                  </div>
                </td>
                <td className={cn("px-3 py-2 text-right", row.putChg >= 0 ? "text-up" : "text-down")}>{formatPct(row.putChg)}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void trade("PE", row)}
                    className="font-bold text-down hover:underline"
                    title="Buy put"
                  >
                    {formatNumber(row.putLtp)}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">{row.putIv ? `${row.putIv.toFixed(1)}` : "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500">{formatOi(row.putVol || 0)}</td>
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
        Click a call or put LTP to send a MIS order on the active broker. Connect Dhan with an Access Token to load the live chain from DhanHQ.
      </p>
    </div>
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
      <div
        className={cn("h-full rounded", side === "call" ? "bg-emerald-400" : "ml-auto bg-rose-400")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
