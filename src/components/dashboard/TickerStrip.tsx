import { cn, formatChange, formatPct, formatQuote, indexTapeLabel, quoteDayChange, quoteTone, vwapTone } from "../../lib/format";
import { chainIdFromIndex, OPTION_UNDERLYINGS } from "../../lib/markets";
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
  const liveLots = data.optionMeta?.underlyings || [];
  const underlyings = [
    ...OPTION_UNDERLYINGS.map((row) => liveLots.find((item) => item.id === row.id) || row),
    ...liveLots.filter((item) => !OPTION_UNDERLYINGS.some((row) => row.id === item.id)),
  ];
  const quotes = data.indices || [];
  const tape = [
    ...underlyings.map((row) => {
      const quote = quotes.find((item) => chainIdFromIndex(item.symbol) === row.id);
      return {
        key: row.id,
        chainId: row.id,
        title: `${row.label} · ${row.lot}`,
        symbol: quote?.symbol || row.label,
        lot: row.lot,
        price: Number(quote?.price || 0),
        change: Number(quote?.change || 0),
        changePct: Number(quote?.changePct || 0),
        prevClose: Number(quote?.prevClose || 0),
        future: Number(quote?.future || quote?.price || 0),
        vwap: Number(quote?.futureVwap || quote?.vwap || 0),
        selectable: Boolean(onSelect),
      };
    }),
    ...quotes
      .filter((item) => item.symbol === "INDIA VIX")
      .map((item) => ({
        key: item.symbol,
        chainId: "",
        title: item.symbol,
        symbol: item.symbol,
        lot: 0,
        price: Number(item.price || 0),
        change: Number(item.change || 0),
        changePct: Number(item.changePct || 0),
        prevClose: Number(item.prevClose || 0),
        future: 0,
        vwap: 0,
        selectable: false,
      })),
  ];

  return (
    <section className="card overflow-x-auto p-0" data-market-tape="option-lots">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-1.5">
        <div className="desk-kicker">Market tape</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {data.dhanFeed?.live ? "LIVE FEED" : "LAST QUOTE"}
        </div>
      </div>
      <div className="tape-strip">
        {tape.map((item) => {
          const day = quoteDayChange(item);
          const tone = quoteTone(day.change);
          const showDeriv = item.chainId !== "";
          const vwap = cardVwap(item);
          const futureLtp = item.future || item.price;
          const selected = Boolean(onSelect && item.chainId && item.chainId === selectedId);
          const tapeLabel = indexTapeLabel(item.symbol);
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                if (item.selectable && item.chainId) onSelect?.(item.chainId);
              }}
              className={cn(
                "tape-cell text-left",
                item.selectable ? "cursor-pointer hover:bg-[var(--card-muted)]" : "cursor-default",
                selected && "bg-[var(--card-muted)]",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{item.title}</div>
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
                    <div className="uppercase tracking-wide text-slate-400">Lot</div>
                    <div className="font-bold">{item.lot || "—"}</div>
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
