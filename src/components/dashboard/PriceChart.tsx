import {
  Crosshair,
  Expand,
  Minus,
  Ruler,
  Spline,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getCandles } from "../../api/client";
import { cn, formatQuote, hasDhanQuotes, kotakAdminTape } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import {
  CandleChart,
  type ChartDrawing,
  type ChartIndicators,
  type ChartTool,
} from "../charts/CandleChart";
import type { Candle } from "../../lib/chartData";

const timeframes = ["1m", "5m", "15m", "1H", "1D"] as const;

const tools: { id: ChartTool; Icon: typeof Crosshair; title: string }[] = [
  { id: "crosshair", Icon: Crosshair, title: "Crosshair" },
  { id: "hline", Icon: Minus, title: "Horizontal line" },
  { id: "trend", Icon: Spline, title: "Trend line" },
  { id: "rect", Icon: Square, title: "Rectangle" },
  { id: "text", Icon: Type, title: "Text" },
  { id: "measure", Icon: Ruler, title: "Measure" },
];

const indicatorDefs: { id: keyof ChartIndicators; label: string; color: string }[] = [
  { id: "ema9", label: "EMA 9", color: "#fd6b01" },
  { id: "ema21", label: "EMA 21", color: "#60a5fa" },
  { id: "sma20", label: "SMA 20", color: "#eab308" },
  { id: "vwap", label: "VWAP", color: "#c084fc" },
];

export function PriceChart() {
  const { data } = useMarket();
  const ohlc = data.ohlc;
  const dhanLive = Boolean(data.dhanFeed?.live);
  const dhanQuotes = hasDhanQuotes(data);
  const kotakTape = kotakAdminTape(data);
  const liveTape = dhanQuotes || kotakTape;
  const sourceLabel = kotakTape ? (dhanLive ? "KOTAK LIVE" : "KOTAK") : dhanQuotes ? (dhanLive ? "DHAN LIVE" : "DHAN") : "WAIT";
  const [tf, setTf] = useState<(typeof timeframes)[number]>("5m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tool, setTool] = useState<ChartTool>("crosshair");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [indicators, setIndicators] = useState<ChartIndicators>({
    ema9: true,
    ema21: true,
    sma20: false,
    vwap: true,
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getCandles(tf);
        if (cancelled) return;
        setCandles(Array.isArray(next) && next.length ? next : []);
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

  useEffect(() => {
    setDrawings([]);
  }, [tf]);

  const toggleIndicator = (id: keyof ChartIndicators) => {
    setIndicators((current) => ({ ...current, [id]: !current[id] }));
  };

  const renderChart = () => (
    <CandleChart
      candles={candles}
      dark
      tool={tool}
      indicators={indicators}
      drawings={drawings}
      onDrawingsChange={setDrawings}
    />
  );

  const toolHint =
    tool === "crosshair"
      ? candles.length
        ? "Hover for OHLC · live Dhan bars"
        : "Waiting for live Dhan candles"
      : tool === "hline" || tool === "text"
        ? "Click the live chart to place"
        : "Click twice on the live chart";

  const toolbox = (vertical: boolean) => (
    <div
      className={cn(
        "gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1",
        vertical ? "hidden h-[220px] flex-col sm:flex sm:h-[320px]" : "flex flex-row sm:hidden",
      )}
    >
      {tools.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          aria-pressed={tool === id}
          onClick={() => setTool(id)}
          className={cn("icon-btn h-8 w-8", tool === id && "icon-btn-on")}
        >
          <Icon size={14} />
        </button>
      ))}
      <button
        type="button"
        title="Clear drawings"
        disabled={!drawings.length}
        onClick={() => setDrawings([])}
        className="icon-btn h-8 w-8 disabled:opacity-40"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const indicatorBar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {indicatorDefs.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={indicators[item.id]}
          onClick={() => toggleIndicator(item.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide",
            indicators[item.id]
              ? "border-transparent bg-[#0b1524] text-white"
              : "border-[var(--border)] bg-[var(--card)] text-slate-400",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
          {item.label}
        </button>
      ))}
      <span className="text-[10px] font-medium text-slate-400">{toolHint}</span>
    </div>
  );

  return (
    <section className="card flex flex-col p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div>
              <div className="desk-kicker">Chart</div>
              <h2 className="text-sm font-bold">NIFTY 50 NSE</h2>
            </div>
            <span className={cn("flex items-center gap-1 text-[11px] font-semibold", liveTape ? "text-up" : "text-slate-400")}>
              <span className={cn("h-1.5 w-1.5 rounded-full", liveTape ? "pulse-dot bg-up" : "bg-slate-400")} />
              {sourceLabel}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
            <div className="px text-2xl font-extrabold leading-none">{formatQuote(ohlc.close)}</div>
            <div className="mb-0.5 min-w-0 text-xs font-medium text-slate-500">
              O {formatQuote(ohlc.open)} H {formatQuote(ohlc.high)} L {formatQuote(ohlc.low)} C {formatQuote(ohlc.close)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="desk-tabs">
            {timeframes.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTf(item)}
                className={tf === item ? "bg-navy-900 text-white" : "text-slate-400"}
              >
                {item}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" title="Expand" onClick={() => setExpanded(true)}>
            <Expand size={15} />
          </button>
        </div>
      </div>
      <div className="mb-2">{indicatorBar}</div>
      {toolbox(false)}
      <div className="mt-2 flex gap-2">
        {toolbox(true)}
        <div className="chart-well min-w-0 flex-1">{renderChart()}</div>
      </div>
      {expanded ? (
        <div className="desk-overlay z-[80]" onClick={() => setExpanded(false)}>
          <div
            className="desk-sheet desk-sheet-wide flex flex-col gap-2 bg-[var(--card)] p-3"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="desk-kicker">Live chart</div>
                <h3 className="text-sm font-bold">NIFTY 50 · {tf}</h3>
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setExpanded(false)}>
                <X size={15} />
              </button>
            </div>
            {indicatorBar}
            <div className="flex gap-2">
              <div className="hidden h-[min(56vh,420px)] flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 sm:flex">
                {tools.map(({ id, Icon, title }) => (
                  <button
                    key={id}
                    type="button"
                    title={title}
                    aria-pressed={tool === id}
                    onClick={() => setTool(id)}
                    className={cn("icon-btn h-8 w-8", tool === id && "icon-btn-on")}
                  >
                    <Icon size={14} />
                  </button>
                ))}
                <button
                  type="button"
                  title="Clear drawings"
                  disabled={!drawings.length}
                  onClick={() => setDrawings([])}
                  className="icon-btn h-8 w-8 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="chart-well chart-well-expand min-w-0 flex-1">{renderChart()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
