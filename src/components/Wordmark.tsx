import { cn } from "../lib/format";

type Props = {
  compact?: boolean;
  tagline?: boolean;
  invert?: boolean;
  className?: string;
};

export function Wordmark({ compact, tagline, invert, className }: Props) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <span className={cn("flex items-end gap-[3px]", compact ? "pb-0.5" : "pb-1")} aria-hidden>
        <span className={cn("rounded-[2px] bg-brand-500", compact ? "h-2.5 w-1" : "h-3.5 w-1.5")} />
        <span className={cn("rounded-[2px] bg-brand-500", compact ? "h-3.5 w-1" : "h-5 w-1.5")} />
        <span className={cn("rounded-[2px] bg-brand-500", compact ? "h-5 w-1" : "h-7 w-1.5")} />
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "truncate font-extrabold leading-none tracking-tight",
            compact ? "text-[17px]" : "text-[22px]",
            invert ? "text-white" : "text-[#0f2744]",
          )}
        >
          Trade2Smart
        </div>
        {tagline ? (
          <div className={cn("mt-1 text-[11px] font-medium", invert ? "text-white/60" : "text-slate-400")}>
            AI Powered by Shivam Fintech
          </div>
        ) : null}
      </div>
    </div>
  );
}
