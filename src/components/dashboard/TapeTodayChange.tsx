import { cn, formatChange, formatPct, quoteTone } from "../../lib/format";

export function TapeTodayChange({ change, changePct }: { change: number; changePct: number }) {
  const tone = quoteTone(change);
  const up = change > 0;
  const down = change < 0;
  return (
    <div
      data-today-change="true"
      className={cn(
        "mt-1.5 rounded-md px-1.5 py-1",
        up && "bg-emerald-50",
        down && "bg-rose-50",
        !up && !down && "bg-slate-100",
      )}
    >
      <div className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Today</div>
      <div className={cn("text-sm font-black leading-tight", tone || "text-slate-500")}>
        {formatChange(change)} ({formatPct(changePct)})
      </div>
    </div>
  );
}
