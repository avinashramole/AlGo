import { useState } from "react";
import { Link } from "react-router-dom";
import { OptionIdsTape } from "../components/dashboard/OptionIdsTape";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, formatPct, isNseSessionOpen } from "../lib/format";

function chainIdFromWatch(symbol: string) {
  const compact = String(symbol || "")
    .toUpperCase()
    .replace(/\s+/g, "");
  if (compact.includes("BANKNIFTY")) return "BANKNIFTY";
  if (compact.includes("FINNIFTY")) return "FINNIFTY";
  if (compact.includes("SENSEX")) return "SENSEX";
  if (compact.includes("NIFTY")) return "NIFTY";
  return "";
}

export function Options() {
  const { data, selectChain } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
  ];
  const rows = data.optionChain || [];
  const watch = data.marketWatch || [];
  const [lots, setLots] = useState(1);
  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const pcrText = meta?.pcr != null ? meta.pcr.toFixed(2) : "—";
  const atmIvText = meta?.atmIv ? `${meta.atmIv.toFixed(1)}%` : "—";
  const lotSize = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lotSize;
  const sourceLabel = data.dhanFeed?.live ? (meta?.source === "dhan" ? "DHAN LIVE" : "DHAN LIVE · waiting for chain") : "DEMO";
  const expiryLabel = meta?.expiryLabel || meta?.expiry || "—";

  return (
    <div className="flex min-h-0 flex-col gap-3 md:h-full md:overflow-hidden">
      <div className="shrink-0 space-y-3">
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
        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">
            Markets
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2 font-semibold">Symbol</th>
                  <th className="px-4 py-2 text-right font-semibold">LTP</th>
                  <th className="px-4 py-2 text-right font-semibold">Change</th>
                  <th className="px-4 py-2 text-right font-semibold">Volume</th>
                  <th className="px-4 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {watch.map((row) => {
                  const chainId = chainIdFromWatch(row.symbol);
                  const active = Boolean(chainId) && chainId === meta?.symbol;
                  return (
                    <tr key={row.symbol} className="soft-row">
                      <td className="px-4 py-2 font-semibold">{row.symbol}</td>
                      <td className="px-4 py-2 text-right">{formatNumber(row.ltp)}</td>
                      <td className={cn("px-4 py-2 text-right font-semibold", row.chg >= 0 ? "text-up" : "text-down")}>
                        {formatPct(row.chg)}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">{row.volume}</td>
                      <td className="px-4 py-2 text-right">
                        {chainId ? (
                          <button
                            type="button"
                            onClick={() => void selectChain(chainId)}
                            className={cn(
                              "rounded-lg px-3 py-1 text-xs font-semibold",
                              active
                                ? "bg-brand-500 text-white"
                                : "bg-brand-50 text-brand-500 dark:bg-brand-500/15",
                            )}
                          >
                            Chain
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
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
            isNseSessionOpen() ? (
            <>
              BUY/SELL goes to Dhan. Confirm in the{" "}
              <Link to="/orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app.
            </>
            ) : (
            <>
              NSE is closed (09:15–15:30 IST). BUY/SELL is sent to Dhan as an after-market order for next open. Confirm in the{" "}
              <Link to="/orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app AMO tab.
            </>
            )
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
      </div>
      <OptionIdsTape lots={lots} />
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
