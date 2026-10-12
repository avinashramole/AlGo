import { cn, formatChange, formatPct, quoteTone } from "../../lib/format";

export function TapeTodayChange({ change, changePct }: { change: number; changePct: number }) {
  const tone = quoteTone(change);
  return (
    <div className="mt-1 flex items-baseline justify-between gap-2" data-today-change="true">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Today</span>
      <span className={cn("text-[11px] font-extrabold", tone || "text-slate-400")}>
        {formatChange(change)} ({formatPct(changePct)})
      </span>
    </div>
  );
}
