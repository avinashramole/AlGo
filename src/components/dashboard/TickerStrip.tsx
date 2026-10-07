import { cn, formatChange, formatPct, formatQuote, indexTapeLabel, quoteDayChange, quoteTone, vwapTone } from "../../lib/format";
import { chainIdFromIndex } from "../../lib/markets";
import { useMarket } from "../../context/MarketContext";

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
    <section className="card overflow-x-auto p-0">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <div className="desk-kicker">Market tape</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {data.dhanFeed?.live ? "LIVE FEED" : "LAST QUOTE"}
        </div>
      </div>
      <div className="tape-strip">
        {data.indices.map((item) => {
          const day = quoteDayChange(item);
          const tone = quoteTone(day.change);
          const showDeriv = item.symbol !== "INDIA VIX";
          const vwap = cardVwap(item);
          const futureLtp = item.future || item.price;
          const chainId = chainIdFromIndex(item.symbol);
          const selectable = Boolean(onSelect && chainId);
          const selected = selectable && chainId === selectedId;
          const tapeLabel = indexTapeLabel(item.symbol);
          const volume = watchBySymbol.get(item.symbol)?.volume || (showDeriv ? tapeLabel : "—");
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => {
                if (selectable) onSelect?.(chainId);
              }}
              className={cn(
                "tape-cell text-left",
                selectable ? "cursor-pointer hover:bg-[var(--card-muted)]" : "cursor-default",
                selected && "bg-[var(--card-muted)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {item.symbol}
                </div>
                <div className="text-[10px] font-semibold uppercase text-slate-400">{tapeLabel}</div>
              </div>
              <div className={cn("px mt-1 text-lg font-extrabold leading-none", tone)}>{formatQuote(item.price)}</div>
              <div className={cn("mt-1 text-[11px] font-semibold", tone || "text-slate-400")}>
                {formatChange(day.change)} ({formatPct(day.changePct)})
              </div>
              {showDeriv ? (
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px]">
                  <div>
                    <div className="uppercase tracking-wide text-slate-400">Fut</div>
                    <div className="px font-bold">{formatQuote(futureLtp)}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-slate-400">Vwap</div>
                    <div className={cn("px font-bold", vwapTone(vwap, futureLtp))}>{vwap ? formatQuote(vwap) : "—"}</div>
                  </div>
                  <div>
                    <div className="uppercase tracking-wide text-slate-400">{onSelect ? "Vol" : "Lot"}</div>
                    <div className="font-bold">{onSelect ? volume : item.lot || "—"}</div>
                  </div>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
