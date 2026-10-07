import {
  ArrowUpRight,
  Crosshair,
  Expand,
  FlipVertical,
  GripHorizontal,
  Layers,
  Magnet,
  Minus,
  MoveRight,
  Ruler,
  Spline,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getCandles } from "../../api/client";
import { cn, formatQuote, hasDhanQuotes, kotakAdminTape } from "../../lib/format";
import { useMarket } from "../../context/MarketContext";
import { CandleChart } from "../charts/CandleChart";
import type { Candle } from "../../lib/chartData";
import {
  CHART_TYPES,
  DEFAULT_INDICATORS,
  STUDY_GROUPS,
  toolHint,
  type ChartDrawing,
  type ChartIndicators,
  type ChartTool,
  type ChartType,
} from "../../lib/chartStudies";

const timeframes = ["1m", "3m", "5m", "15m", "30m", "1H", "1D"] as const;

const tools: { id: ChartTool; Icon: typeof Crosshair; title: string }[] = [
  { id: "crosshair", Icon: Crosshair, title: "Crosshair" },
  { id: "hline", Icon: Minus, title: "Horizontal line" },
  { id: "vline", Icon: FlipVertical, title: "Vertical line" },
  { id: "trend", Icon: Spline, title: "Trend line" },
  { id: "ray", Icon: MoveRight, title: "Ray" },
  { id: "fib", Icon: Layers, title: "Fibonacci" },
  { id: "rect", Icon: Square, title: "Rectangle" },
  { id: "channel", Icon: GripHorizontal, title: "Parallel channel" },
  { id: "arrow", Icon: ArrowUpRight, title: "Arrow" },
  { id: "text", Icon: Type, title: "Text" },
  { id: "measure", Icon: Ruler, title: "Measure" },
];

const studyColor = Object.fromEntries(STUDY_GROUPS.flatMap((group) => group.items.map((item) => [item.id, item.color]))) as Record<
  keyof ChartIndicators,
  string
>;

export function PriceChart() {
  const { data } = useMarket();
  const ohlc = data.ohlc;
  const dhanLive = Boolean(data.dhanFeed?.live);
  const dhanQuotes = hasDhanQuotes(data);
  const kotakTape = kotakAdminTape(data);
  const liveTape = dhanQuotes || kotakTape;
  const sourceLabel = kotakTape ? (dhanLive ? "KOTAK LIVE" : "KOTAK") : dhanQuotes ? (dhanLive ? "DHAN LIVE" : "DHAN") : "WAIT";
  const [tf, setTf] = useState<(typeof timeframes)[number]>("15m");
  const [chartType, setChartType] = useState<ChartType>("candle");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [tool, setTool] = useState<ChartTool>("crosshair");
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [studiesOpen, setStudiesOpen] = useState(false);
  const [magnet, setMagnet] = useState(true);
  const [indicators, setIndicators] = useState<ChartIndicators>(DEFAULT_INDICATORS);

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

  const activeStudies = useMemo(
    () => STUDY_GROUPS.flatMap((group) => group.items).filter((item) => indicators[item.id]),
    [indicators],
  );

  const renderChart = () => (
    <CandleChart
      candles={candles}
      dark
      tool={tool}
      chartType={chartType}
      magnet={magnet}
      indicators={indicators}
      drawings={drawings}
      onDrawingsChange={setDrawings}
    />
  );

  const toolbox = (kind: "mobile" | "desk" | "overlay") => (
    <div
      className={cn(
        kind === "mobile" && "chart-toolbox chart-toolbox-horiz flex sm:hidden",
        kind === "desk" && "chart-toolbox chart-toolbox-vert hidden sm:flex",
        kind === "overlay" && "chart-toolbox chart-toolbox-vert flex",
      )}
    >
      {tools.map(({ id, Icon, title }) => (
        <button
          key={id}
          type="button"
          title={title}
          aria-pressed={tool === id}
          onClick={() => setTool(id)}
          className={cn("icon-btn h-7 w-7 shrink-0", tool === id && "icon-btn-on")}
        >
          <Icon size={13} />
        </button>
      ))}
      <button
        type="button"
        title="Magnet to OHLC"
        aria-pressed={magnet}
        onClick={() => setMagnet((value) => !value)}
        className={cn("icon-btn h-7 w-7 shrink-0", magnet && "icon-btn-on")}
      >
        <Magnet size={13} />
      </button>
      <button
        type="button"
        title="Undo drawing"
        disabled={!drawings.length}
        onClick={() => setDrawings((rows) => rows.slice(0, -1))}
        className="icon-btn h-7 w-7 shrink-0 disabled:opacity-40"
      >
        <Undo2 size={13} />
      </button>
      <button
        type="button"
        title="Clear drawings"
        disabled={!drawings.length}
        onClick={() => setDrawings([])}
        className="icon-btn h-7 w-7 shrink-0 disabled:opacity-40"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );

  const studiesMenu = (
    <div className="relative">
      <button
        type="button"
        className={cn("desk-chip", studiesOpen && "desk-chip-on")}
        aria-expanded={studiesOpen}
        onClick={() => setStudiesOpen((open) => !open)}
      >
        Studies
      </button>
      {studiesOpen ? (
        <div className="chart-study-menu">
          {STUDY_GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group.title}</div>
              <div className="mb-2 grid grid-cols-2 gap-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={indicators[item.id]}
                    onClick={() => toggleIndicator(item.id)}
                    className={cn("chart-study-item", indicators[item.id] && "chart-study-item-on")}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  const indicatorBar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {studiesMenu}
      {CHART_TYPES.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={chartType === item.id}
          onClick={() => setChartType(item.id)}
          className={cn("desk-chip", chartType === item.id && "desk-chip-on")}
        >
          {item.label}
        </button>
      ))}
      {activeStudies.slice(0, 8).map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed
          onClick={() => toggleIndicator(item.id)}
          className="inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[#0b1524] px-2 py-0.5 text-[10px] font-bold text-white"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: studyColor[item.id] }} />
          {item.label}
        </button>
      ))}
      <span className="text-[10px] font-medium text-slate-400">{toolHint(tool, candles.length > 0)}</span>
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
      {toolbox("mobile")}
      <div className="mt-2 flex gap-2">
        {toolbox("desk")}
        <div className="chart-well min-w-0 flex-1" onClick={() => studiesOpen && setStudiesOpen(false)}>
          {renderChart()}
        </div>
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
                <h3 className="text-sm font-bold">
                  NIFTY 50 · {tf} · {chartType}
                </h3>
              </div>
              <button type="button" className="icon-btn" title="Close" onClick={() => setExpanded(false)}>
                <X size={15} />
              </button>
            </div>
            {indicatorBar}
            <div className="flex gap-2">
              {toolbox("overlay")}
              <div className="chart-well chart-well-expand min-w-0 flex-1">{renderChart()}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
