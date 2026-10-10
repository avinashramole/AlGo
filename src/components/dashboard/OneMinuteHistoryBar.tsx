import { useCallback, useEffect, useState } from "react";
import { getOneMinuteHistory, syncOneMinuteHistory, type OneMinuteHistoryStatus } from "../../api/client";
import { catchDeskError } from "../../lib/liveSite";

function coverageLabel(status: OneMinuteHistoryStatus | null) {
  const rows = status?.symbols || [];
  if (!rows.length) return "No 1m store yet";
  return rows
    .map((row) => `${row.symbol} ${row.stored}/${row.stored + row.missing}`)
    .join(" · ");
}

export function OneMinuteHistoryBar() {
  const [status, setStatus] = useState<OneMinuteHistoryStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const next = await getOneMinuteHistory({ years: 1 });
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => setError(catchDeskError(err, "Could not read 1m history")));
  }, [load]);

  useEffect(() => {
    if (!status?.job?.running) return undefined;
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [load, status?.job?.running]);

  const sync = async () => {
    setBusy(true);
    setError("");
    try {
      const next = await syncOneMinuteHistory({ years: 1 });
      setStatus(next);
    } catch (err) {
      setError(catchDeskError(err, "Could not sync 1m history"));
    } finally {
      setBusy(false);
    }
  };

  const running = Boolean(status?.job?.running || busy);
  const ready = Boolean(status?.fineEnough);

  return (
    <section className="card flex flex-wrap items-center justify-between gap-3 p-3" data-one-minute-history>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wide text-brand-600 dark:text-orange-300">1m history store</div>
        <div className="mt-0.5 text-sm font-semibold">{coverageLabel(status)}</div>
        <p className="mt-1 text-xs text-slate-400">
          Sync Dhan 1-minute OHLC in 30-day chunks, then every backtest reuses disk and builds 2 / 5 / 10 / 15m candles.
          {status?.from && status?.to ? ` Window ${status.from} → ${status.to}.` : ""}
          {status?.job?.running && status.job.symbol ? ` Fetching ${status.job.symbol}…` : ""}
          {status?.job?.paused ? " Paused while a backtest is running." : ""}
        </p>
        {error ? <p className="mt-1 text-xs font-semibold text-rose-500">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={running}
        onClick={() => void sync()}
        className="h-10 shrink-0 rounded-lg border border-brand-500 px-4 text-sm font-semibold text-brand-600 disabled:opacity-60 dark:text-orange-200"
      >
        {running ? "Syncing 1m…" : ready ? "Re-sync 1m (1 year)" : "Sync 1m (1 year)"}
      </button>
    </section>
  );
}
