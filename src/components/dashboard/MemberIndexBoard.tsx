import { cn, formatChange, formatNumber, formatPct } from "../../lib/format";
import type { MemberIndexQuote } from "../../api/client";
import { Sparkline } from "../charts/Sparkline";

export function MemberIndexBoard({ indices }: { indices: MemberIndexQuote[] }) {
  if (!indices.length) {
    return (
      <div className="card px-4 py-6 text-sm text-slate-400">Index quotes will show here after the desk feed starts.</div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {indices.map((item) => {
        const up = item.change >= 0;
        return (
          <article key={item.symbol} className="card px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.symbol}</div>
                <div className="mt-1 text-lg font-bold leading-none">{formatNumber(item.price)}</div>
                <div className={cn("mt-1 text-xs font-semibold", up ? "text-up" : "text-down")}>
                  {formatChange(item.change)} ({formatPct(item.changePct)}) today
                </div>
              </div>
              <Sparkline data={item.spark?.length ? item.spark : [item.price]} up={up} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Future</div>
                <div className="text-sm font-bold">{formatNumber(item.future || item.price)}</div>
                <div className="text-[10px] text-slate-400">{item.futureExpiry || ""}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Lot</div>
                <div className="text-sm font-bold">{item.lot ? `1 lot = ${item.lot}` : "—"}</div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
