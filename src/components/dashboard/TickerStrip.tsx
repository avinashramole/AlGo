import { cn, formatChange, formatPct, formatQuote, indexTapeLabel, vwapTone } from "../../lib/format";
import { chainIdFromIndex } from "../../lib/markets";
import { useMarket } from "../../context/MarketContext";
import { Sparkline } from "../charts/Sparkline";

function cardVwap(item: { future?: number; price: number; vwap?: number; futureVwap?: number }) {
  const vwap = Number(item.futureVwap || item.vwap);
  return vwap > 0 ? vwap : 0;
}

type TickerStripProps = {
  selectedId?: string;
  onSelect?: (chainId: string) => void;
};

export function TickerStrip({ selectedId, onSelect }: TickerStripProps = {}) {
  const { data } = useMarket();
  const watchBySymbol = new Map((data.marketWatch || []).map((row) => [row.symbol, row]));

  return (
    <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {data.indices.map((item) => {
        const up = item.change >= 0;
        const showDeriv = item.symbol !== "INDIA VIX";
        const vwap = cardVwap(item);
        const futureLtp = item.future || item.price;
        const chainId = chainIdFromIndex(item.symbol);
        const selectable = Boolean(onSelect && chainId);
        const selected = selectable && chainId === selectedId;
        const tapeLabel = indexTapeLabel(item.symbol);
        const volume = watchBySymbol.get(item.symbol)?.volume || (showDeriv ? tapeLabel : "—");
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
                <div className="flex items-center gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{tapeLabel}</div>
                </div>
                <div className="mt-1 text-lg font-bold leading-none">{formatQuote(item.price)}</div>
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
                  <div className="text-sm font-bold">{formatQuote(futureLtp)}</div>
                  <div className="text-[10px] text-slate-400">{item.futureExpiry || ""}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">VWAP</div>
                  <div className={cn("text-sm font-bold", vwapTone(vwap, futureLtp))}>
                    {vwap ? formatQuote(vwap) : "—"}
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
          </div>
        );
      })}
    </div>
  );
}
