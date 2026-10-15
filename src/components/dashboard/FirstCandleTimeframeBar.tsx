import { cn } from "../../lib/format";
import {
  DESK_TIMEFRAME_PRESETS,
  firstCandleMinutes,
  firstCandleTimeframeSelect,
  firstCandleTimeframeValue,
} from "../../lib/strategies";

const CHOICES = [...DESK_TIMEFRAME_PRESETS, "custom"] as const;

function presetLabel(row: string) {
  if (row === "custom") return "Custom";
  if (row === "1H") return "1hr";
  return row;
}

export function FirstCandleTimeframeBar({
  timeframe,
  onPick,
  saving = false,
  mark,
  commitCustomOnBlur = false,
  label = "Candle timeframe · 5m 15m 30m 1hr Custom",
}: {
  timeframe?: string;
  onPick: (timeframe: string) => void;
  saving?: boolean;
  mark?: "nifty" | "crude" | "form" | "test1" | "mir" | "shivam-index" | "shivam-ce" | "shivam-pe";
  commitCustomOnBlur?: boolean;
  label?: string;
}) {
  const selected = firstCandleTimeframeSelect(timeframe);
  return (
    <div
      className="mt-2 w-full min-w-0 overflow-visible"
      data-first-candle-timeframe-bar={mark || "form"}
      data-desk-timeframe-bar={mark || "form"}
      data-test1-timeframe={mark === "test1" ? "true" : undefined}
      data-mir-timeframe={mark === "mir" ? "true" : undefined}
    >
      <div className="text-xs font-extrabold uppercase tracking-wide text-slate-600">{label}</div>
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
            {presetLabel(row)}
          </button>
        ))}
        {selected === "custom" ? (
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500" data-first-candle-custom-minutes="true">
            Minutes
            <input
              className="h-9 w-20 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-sm font-bold text-[var(--text)]"
              type="number"
              min={1}
              max={60}
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
