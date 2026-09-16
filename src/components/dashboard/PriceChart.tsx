import {
  Crosshair,
  Expand,
  Minus,
  PenLine,
  Ruler,
  Spline,
  Square,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCandles } from "../../api/client";
import { cn, formatQuote, hasDhanQuotes } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import { useTheme } from "../../context/ThemeContext";
import { CandleChart } from "../charts/CandleChart";
import type { Candle } from "../../lib/chartData";

const timeframes = ["1m", "5m", "15m", "1H", "1D"] as const;

export function PriceChart() {
  const { theme } = useTheme();
  const { data } = useMarket();
  const ohlc = data.ohlc;
  const dhanLive = Boolean(data.dhanFeed?.live);
  const dhanQuotes = hasDhanQuotes(data);
  const [tf, setTf] = useState<(typeof timeframes)[number]>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getCandles(tf);
        if (cancelled) return;
        setCandles(next?.length ? next : []);
      } catch {
        if (cancelled) return;
        setCandles([]);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), dhanLive ? 2000 : 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [tf, dhanLive]);

  const tools = [Crosshair, Minus, Spline, Square, Type, PenLine, Ruler];

  return (
    <section className="card flex min-h-[430px] flex-col p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">NIFTY 50 NSE</h2>
            <span className={cn("flex items-center gap-1 text-[11px] font-semibold", dhanQuotes ? "text-up" : "text-slate-400")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", dhanQuotes ? "pulse-dot bg-up" : "bg-slate-400")} />
              {dhanQuotes ? (dhanLive ? "DHAN LIVE" : "DHAN") : "WAIT"}
            </span>
          </div>
          <div className="mt-1 flex items-end gap-3">
            <div className="text-2xl font-extrabold leading-none">{formatQuote(ohlc.close)}</div>
            <div className="mb-0.5 text-xs font-medium text-slate-500">
              O {formatQuote(ohlc.open)} &nbsp; H {formatQuote(ohlc.high)} &nbsp; L {formatQuote(ohlc.low)} &nbsp; C {formatQuote(ohlc.close)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-0.5">
            {timeframes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTf(item)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                  tf === item ? "bg-[var(--card)] text-brand-500 shadow-sm" : "text-slate-400"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" title="Expand">
            <Expand size={15} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
          {tools.map((Icon, i) => (
            <button key={i} type="button" className="icon-btn h-8 w-8">
              <Icon size={14} />
            </button>
          ))}
        </div>
        <div className="min-h-[320px] flex-1">
          <CandleChart candles={candles} dark={theme === "dark"} />
        </div>
      </div>
    </section>
  );
}
