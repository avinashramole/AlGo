import { cn, formatQuote, quoteDayChange, quoteTone, tapeLotLine, vwapTone } from "../../lib/format";
import { chainIdFromIndex, OPTION_UNDERLYINGS } from "../../lib/markets";
import { useMarket } from "../../context/MarketContext";
import { DeskTape } from "./DeskTape";
import { TapeTodayChange } from "./TapeTodayChange";

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
        title: row.label,
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
    <DeskTape
      kicker="Market tape"
      extra={data.dhanFeed?.live ? "LIVE FEED" : "LAST QUOTE"}
      meta={tapeLotLine(underlyings)}
      testId="option-lots"
    >
      {tape.map((item) => {
        const day = quoteDayChange(item);
        const tone = quoteTone(day.change);
        const showDeriv = item.chainId !== "";
        const vwap = cardVwap(item);
        const futureLtp = item.future || item.price;
        const selected = Boolean(onSelect && item.chainId && item.chainId === selectedId);
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
            <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{item.title}</div>
            <div className={cn("px mt-1 text-lg font-extrabold leading-none", tone)}>{formatQuote(item.price)}</div>
            <TapeTodayChange change={day.change} changePct={day.changePct} />
            {showDeriv ? (
              <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                <div>
                  <div className="uppercase tracking-wide text-slate-400">Fut</div>
                  <div className="px font-bold">{formatQuote(futureLtp)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-slate-400">Vwap</div>
                  <div className={cn("px font-bold", vwapTone(vwap, futureLtp))}>{vwap ? formatQuote(vwap) : "—"}</div>
                </div>
              </div>
            ) : null}
          </button>
        );
      })}
    </DeskTape>
  );
}
