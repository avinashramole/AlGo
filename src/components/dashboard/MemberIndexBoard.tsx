import { cn, formatChange, formatPct, formatQuote, indexTapeLabel } from "../../lib/format";
import type { MemberIndexQuote } from "../../api/client";
import { Sparkline } from "../charts/Sparkline";

const REQUIRED_CARDS: Array<Pick<MemberIndexQuote, "symbol" | "name" | "lot">> = [
  { symbol: "NIFTY 50", name: "NIFTY", lot: 65 },
  { symbol: "BANKNIFTY", name: "BANKNIFTY", lot: 30 },
  { symbol: "FINNIFTY", name: "FINNIFTY", lot: 60 },
  { symbol: "SENSEX", name: "SENSEX", lot: 20 },
  { symbol: "CRUDEOIL", name: "CRUDE OIL", lot: 100 },
  { symbol: "INDIA VIX", name: "VIX", lot: 0 },
];

function withRequiredCards(indices: MemberIndexQuote[]) {
  const bySymbol = new Map(indices.map((row) => [row.symbol, row]));
  return REQUIRED_CARDS.map((card) => {
    const hit = bySymbol.get(card.symbol);
    return (
      hit || {
        symbol: card.symbol,
        name: card.name,
        price: 0,
        change: 0,
        changePct: 0,
        spark: [],
        future: 0,
        futureExpiry: "",
        lot: card.lot,
      }
    );
  });
}

export function MemberIndexBoard({ indices, note }: { indices: MemberIndexQuote[]; note?: string }) {
  if (!indices.length) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-400">
        {note || "Index quotes use your broker token. Install client ID and access token on My plan."}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
      {withRequiredCards(indices).map((item) => {
        const up = item.change >= 0;
        const showDeriv = item.symbol !== "INDIA VIX";
        return (
          <article key={item.symbol} className="card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {item.symbol === "CRUDEOIL" ? item.name || "CRUDE OIL" : item.symbol}
                  </div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{indexTapeLabel(item.symbol)}</div>
                </div>
                <div className="mt-1 text-lg font-bold leading-none">{formatQuote(item.price)}</div>
                <div className={cn("mt-1 text-xs font-semibold", up ? "text-up" : "text-down")}>
                  {formatChange(item.change)} ({formatPct(item.changePct)}) today
                </div>
              </div>
              <Sparkline data={item.spark?.length ? item.spark : [item.price]} up={up} />
            </div>
            {showDeriv ? (
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Future</div>
                  <div className="text-sm font-bold">{formatQuote(item.future || item.price)}</div>
                  <div className="text-[10px] text-slate-400">{item.futureExpiry || ""}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lot</div>
                  <div className="text-sm font-bold">{item.lot ? `1 lot = ${item.lot}` : "—"}</div>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
