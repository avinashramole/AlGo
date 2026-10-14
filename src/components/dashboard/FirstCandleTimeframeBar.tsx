import { cn } from "../../lib/format";
import {
  FIRST_CANDLE_TIMEFRAMES,
  firstCandleMinutes,
  firstCandleTimeframeSelect,
  firstCandleTimeframeValue,
} from "../../lib/strategies";

const CHOICES = [...FIRST_CANDLE_TIMEFRAMES, "custom"] as const;

export function FirstCandleTimeframeBar({
  timeframe,
  onPick,
  saving = false,
  mark,
  commitCustomOnBlur = false,
}: {
  timeframe?: string;
  onPick: (timeframe: string) => void;
  saving?: boolean;
  mark?: "nifty" | "crude" | "form";
  commitCustomOnBlur?: boolean;
}) {
  const selected = firstCandleTimeframeSelect(timeframe);
  return (
    <div className="mt-2 w-full min-w-0 overflow-visible" data-first-candle-timeframe-bar={mark || "form"}>
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Candle timeframe · 5m 10m 15m 30m 60m Custom</div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {CHOICES.map((row) => (
          <button
            key={row}
            type="button"
            disabled={saving}
            onClick={() =>
              onPick(
                firstCandleTimeframeValue(
                  row,
                  row === "custom" ? (selected === "custom" ? firstCandleMinutes(timeframe) : 20) : undefined,
                ),
              )
            }
            className={cn(
              "h-10 shrink-0 rounded-lg px-3.5 text-sm font-extrabold",
              selected === row ? "bg-brand-500 text-white" : "border border-[var(--border)] bg-[var(--card)] text-[var(--text)]",
            )}
          >
            {row === "custom" ? "Custom" : row}
          </button>
        ))}
        {selected === "custom" ? (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500" data-first-candle-custom-minutes="true">
            Minutes
            <input
              className="h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-bold text-[var(--text)]"
              type="number"
              min={1}
              max={240}
              key={commitCustomOnBlur ? `${timeframe}-custom` : "custom"}
              {...(commitCustomOnBlur
                ? { defaultValue: firstCandleMinutes(timeframe) }
                : { value: firstCandleMinutes(timeframe) })}
              onChange={commitCustomOnBlur ? undefined : (event) => onPick(firstCandleTimeframeValue("custom", Number(event.target.value)))}
              onBlur={(event) => onPick(firstCandleTimeframeValue("custom", Number(event.target.value)))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onPick(firstCandleTimeframeValue("custom", Number((event.target as HTMLInputElement).value)));
                }
              }}
            />
          </label>
        ) : null}
        {saving ? <span className="text-[11px] font-semibold text-slate-400">Saving...</span> : null}
      </div>
    </div>
  );
}
