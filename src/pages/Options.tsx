import { useState } from "react";
import { Link } from "react-router-dom";
import { OptionIdsTape } from "../components/dashboard/OptionIdsTape";
import { TickerStrip } from "../components/dashboard/TickerStrip";
import { useMarket } from "../context/MarketContext";
import { cn, formatNumber, isMcxSessionOpen, isNseSessionOpen } from "../lib/format";

export function Options() {
  const { data, selectChain } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
    { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 },
  ];
  const rows = data.optionChain || [];
  const [lots, setLots] = useState(1);
  const atm = rows.find((row) => row.atm);
  const spot = meta?.spot || data.indices[0]?.price || 0;
  const lotSize = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const qty = Math.max(1, lots) * lotSize;
  const sourceLabel = data.dhanFeed?.live ? (meta?.source === "dhan" ? "DHAN LIVE" : "DHAN LIVE · waiting for chain") : "DEMO";
  const expiryLabel = meta?.expiryLabel || meta?.expiry || "—";
  const isCrude = String(meta?.symbol || "").toUpperCase().includes("CRUDEOIL");
  const sessionOpen = isCrude ? isMcxSessionOpen() : isNseSessionOpen();
  const sessionHours = isCrude ? "MCX 09:00–23:30 IST" : "NSE 09:15–15:30 IST";

  return (
    <div className="flex min-h-0 flex-col gap-3 md:h-full md:overflow-hidden">
      <div className="shrink-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Option Chain</h1>
            <p className="text-sm text-slate-400">
              {meta?.symbol || "NIFTY"} · Expiry {expiryLabel} · ATM ±10 · {sourceLabel}
            </p>
          </div>
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
        <TickerStrip
          selectedId={meta?.symbol}
          onSelect={(chainId) => void selectChain(chainId)}
          chainStats={{
            spot: formatNumber(spot),
            atm: atm ? formatNumber(atm.strike, 0) : "—",
            pcr: meta?.pcr != null ? meta.pcr.toFixed(2) : "—",
            maxPain: meta?.maxPain ? formatNumber(meta.maxPain, 0) : "—",
            atmIv: meta?.atmIv ? `${meta.atmIv.toFixed(1)}%` : "—",
          }}
        />
        <div
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-semibold",
            data.dhanFeed?.live ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
          )}
        >
          {data.dhanFeed?.live ? (
            sessionOpen ? (
            <>
              BUY/SELL goes to Dhan. Confirm in the{" "}
              <Link to="/orders" className="underline">
                order book
              </Link>{" "}
              and the Dhan app.
            </>
            ) : (
            <>
              {sessionHours} is closed. BUY/SELL is sent to Dhan as an after-market order for next open. Confirm in the{" "}
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
