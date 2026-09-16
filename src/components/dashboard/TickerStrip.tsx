import { useState } from "react";
import { cn, formatChange, formatNumber, formatPct, vwapTone } from "../../lib/format";
import { chainIdFromIndex } from "../../lib/markets";
import { useMarket } from "../../context/MarketContext";
import { Sparkline } from "../charts/Sparkline";

function cardVwap(item: { future?: number; price: number; vwap?: number; futureVwap?: number }) {
  const vwap = Number(item.futureVwap || item.vwap);
  return vwap > 0 ? vwap : 0;
}

type ChainCardStats = {
  spot: string;
  atm: string;
  pcr: string;
  maxPain: string;
  atmIv: string;
};

type TickerStripProps = {
  selectedId?: string;
  onSelect?: (chainId: string) => void;
  chainStats?: ChainCardStats;
};

export function TickerStrip({ selectedId, onSelect, chainStats }: TickerStripProps = {}) {
  const { data, order } = useMarket();
  const [busy, setBusy] = useState("");
  const watchBySymbol = new Map((data.marketWatch || []).map((row) => [row.symbol, row]));

  const tradeFuture = async (item: (typeof data.indices)[number], side: "BUY" | "SELL") => {
    const root = item.symbol === "NIFTY 50" ? "NIFTY" : item.symbol;
    const key = `${root}-${side}`;
    setBusy(key);
    try {
      await order({
        symbol: `${root} FUT`,
        kind: "future",
        side,
        qty: item.lot || 65,
        price: item.future || item.price,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        expiry: item.futureExpiry,
        exchangeSegment: item.futureSegment,
      });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Order failed");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {data.indices.map((item) => {
        const up = item.change >= 0;
        const showDeriv = item.symbol !== "INDIA VIX";
        const root = item.symbol === "NIFTY 50" ? "NIFTY" : item.name || item.symbol;
        const vwap = cardVwap(item);
        const futureLtp = item.future || item.price;
        const chainId = chainIdFromIndex(item.symbol);
        const selectable = Boolean(onSelect && chainId);
        const selected = selectable && chainId === selectedId;
        const volume = watchBySymbol.get(item.symbol)?.volume || (showDeriv ? "Live" : "—");
        return (
          <div
            key={item.symbol}
            role={selectable ? "button" : undefined}
            tabIndex={selectable ? 0 : undefined}
            onClick={() => {
              if (selectable) onSelect?.(chainId);
            }}
            onKeyDown={(event) => {
              if (!selectable) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(chainId);
              }
            }}
            className={cn(
              "card px-4 py-3",
              selectable && "cursor-pointer",
              selected && "ring-2 ring-brand-500",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
                <div className="mt-1 text-lg font-bold leading-none">{formatNumber(item.price)}</div>
                <div className={cn("mt-1 text-xs font-semibold", up ? "text-up" : "text-down")}>
                  {formatChange(item.change)} ({formatPct(item.changePct)}) today
                </div>
              </div>
              <Sparkline data={item.spark || [item.price]} up={up} />
            </div>
            {showDeriv ? (
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Future</div>
                  <div className="text-sm font-bold">{formatNumber(futureLtp)}</div>
                  <div className="text-[10px] text-slate-400">{item.futureExpiry || ""}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VWAP</div>
                  <div className={cn("text-sm font-bold", vwapTone(vwap, futureLtp))}>
                    {vwap ? formatNumber(vwap) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {onSelect ? "Volume" : "Lot"}
                  </div>
                  <div className="text-sm font-bold">{onSelect ? volume : item.lot ? `1 lot = ${item.lot}` : "—"}</div>
                  {onSelect && item.lot ? <div className="text-[10px] text-slate-400">1 lot = {item.lot}</div> : null}
                </div>
              </div>
            ) : null}
            {selected && chainStats ? (
              <div className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1 border-t border-[var(--border)] pt-2">
                <ChainStat label="Spot" value={chainStats.spot} />
                <ChainStat label="ATM" value={chainStats.atm} />
                <ChainStat label="PCR" value={chainStats.pcr} />
                <ChainStat label="Max pain" value={chainStats.maxPain} />
                <ChainStat label="ATM IV" value={chainStats.atmIv} />
              </div>
            ) : null}
            {showDeriv && selectable ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelect?.(chainId);
                }}
                className={cn(
                  "mt-2 h-10 w-full rounded-md text-xs font-bold md:h-7 md:text-[10px]",
                  selected ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--bg)]",
                )}
              >
                Chain
              </button>
            ) : null}
            {showDeriv && !selectable ? (
              <div className="mt-2 flex gap-1">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={(event) => {
                    event.stopPropagation();
                    void tradeFuture(item, "BUY");
                  }}
                  className="h-10 flex-1 rounded-md bg-emerald-500 text-xs font-bold text-white disabled:opacity-50 md:h-7 md:text-[10px]"
                >
                  {busy === `${root}-BUY` ? "..." : `BUY ${root} FUT`}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={(event) => {
                    event.stopPropagation();
                    void tradeFuture(item, "SELL");
                  }}
                  className="h-10 flex-1 rounded-md bg-rose-500 text-xs font-bold text-white disabled:opacity-50 md:h-7 md:text-[10px]"
                >
                  {busy === `${root}-SELL` ? "..." : "SELL"}
                </button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ChainStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="truncate text-xs font-bold leading-tight">{value}</div>
    </div>
  );
}
