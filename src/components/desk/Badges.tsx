import { cn } from "../../lib/format";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "FILLED" || status === "CLOSED"
      ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
      : status === "PENDING" || status === "PARTIAL"
        ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40"
        : status === "REJECTED"
          ? "bg-rose-50 text-down dark:bg-rose-950/40"
          : "bg-slate-100 text-slate-500 dark:bg-slate-800";
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone)}>{status}</span>;
}

export function SideBadge({ side }: { side: string }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-bold",
        side === "BUY" ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-rose-50 text-down dark:bg-rose-950/40",
      )}
    >
      {side}
    </span>
  );
}
