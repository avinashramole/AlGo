import { useEffect, useMemo, useRef } from "react";
import type { Candle } from "../../lib/chartData";
import {
  adx,
  atr,
  bollinger,
  cci,
  closes,
  ema,
  FIB_LEVELS,
  heikinAshi,
  macd,
  obv,
  parabolicSar,
  rsi,
  sessionPivots,
  sessionVwap,
  sma,
  stochastic,
  supertrend,
  williamsR,
  wma,
} from "../../lib/chartIndicators";
import { type ChartDrawing, type ChartIndicators, type ChartTool, type ChartType } from "../../lib/chartStudies";

export type { ChartDrawing, ChartIndicators, ChartTool, ChartType };

type Props = {
  candles: Candle[];
  dark: boolean;
  tool?: ChartTool;
  chartType?: ChartType;
  magnet?: boolean;
  indicators?: ChartIndicators;
  drawings?: ChartDrawing[];
  onDrawingsChange?: (next: ChartDrawing[]) => void;
};

type Hover = { i: number; price: number; x: number; y: number } | null;
type Draft = { kind: ChartTool; i0: number; p0: number; i1?: number; p1?: number };

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function lastNum(values: Array<number | null>) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value != null && Number.isFinite(value)) return value;
  }
  return null;
}

function finiteExtent(values: Array<number | null | undefined>, fallback: number[]) {
  const nums = values.filter((value): value is number => value != null && Number.isFinite(value));
  return nums.length ? nums : fallback;
}

export function CandleChart({
  candles,
  dark,
  tool = "crosshair",
  chartType = "candle",
  magnet = true,
  indicators,
  drawings = [],
  onDrawingsChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<Hover>(null);
  const draftRef = useRef<Draft | null>(null);
  const geoRef = useRef({
    pad: { top: 16, right: 64, bottom: 22, left: 8 },
    chartH: 1,
    chartW: 1,
    pMin: 0,
    pMax: 1,
    n: 1,
    priceBottom: 1,
  });

  const theme = useMemo(
    () => ({
      up: "#26a69a",
      down: "#ef5350",
      grid: dark ? "rgba(148,163,184,0.10)" : "rgba(148,163,184,0.22)",
      axis: dark ? "#8aa0b8" : "#64748b",
      volumeUp: "rgba(38,166,154,0.28)",
      volumeDown: "rgba(239,83,80,0.28)",
      cross: "rgba(255,255,255,0.45)",
      ema9: "#fd6b01",
      ema21: "#60a5fa",
      ema50: "#38bdf8",
      sma20: "#eab308",
      sma50: "#f59e0b",
      sma200: "#fb7185",
      wma20: "#34d399",
      vwap: "#c084fc",
      bb: "rgba(148,163,184,0.9)",
      stUp: "#22c55e",
      stDown: "#ef4444",
      psar: "#f97316",
      pivot: "#a3a3a3",
      rsi: "#f472b6",
      macd: "#818cf8",
      signal: "#f59e0b",
      stoch: "#22d3ee",
      atr: "#fbbf24",
      adx: "#fb923c",
      cci: "#4ade80",
      willr: "#e879f9",
      obv: "#67e8f9",
      draw: "#f8fafc",
      fib: "#fbbf24",
    }),
    [dark],
  );

  const bars = useMemo(() => (chartType === "heikin" ? heikinAshi(candles) : candles), [candles, chartType]);

  const series = useMemo(() => {
    const prices = closes(bars);
    return {
      ema9: indicators?.ema9 ? ema(prices, 9) : [],
      ema21: indicators?.ema21 ? ema(prices, 21) : [],
      ema50: indicators?.ema50 ? ema(prices, 50) : [],
      sma20: indicators?.sma20 ? sma(prices, 20) : [],
      sma50: indicators?.sma50 ? sma(prices, 50) : [],
      sma200: indicators?.sma200 ? sma(prices, 200) : [],
      wma20: indicators?.wma20 ? wma(prices, 20) : [],
      vwap: indicators?.vwap ? sessionVwap(candles) : [],
      bb: indicators?.bb ? bollinger(prices, 20, 2) : null,
      supertrend: indicators?.supertrend ? supertrend(bars, 7, 3) : null,
      psar: indicators?.psar ? parabolicSar(bars) : [],
      pivots: indicators?.pivots ? sessionPivots(candles) : null,
      rsi: indicators?.rsi ? rsi(prices, 14) : [],
      macd: indicators?.macd ? macd(prices) : null,
      stoch: indicators?.stoch ? stochastic(bars) : null,
      atr: indicators?.atr ? atr(bars, 14) : [],
      adx: indicators?.adx ? adx(bars, 14) : null,
      cci: indicators?.cci ? cci(bars, 20) : [],
      willr: indicators?.willr ? williamsR(bars, 14) : [],
      obv: indicators?.obv ? obv(candles) : [],
    };
  }, [bars, candles, indicators]);

  useEffect(() => {
    draftRef.current = null;
  }, [tool]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    let lastW = -1;
    let lastH = -1;
    let frame = 0;

    const xAt = (i: number) => {
      const { pad, chartW, n } = geoRef.current;
      return pad.left + (i + 0.5) * (chartW / Math.max(1, n));
    };
    const yAt = (price: number) => {
      const { pad, chartH, pMin, pMax } = geoRef.current;
      return pad.top + ((pMax - price) / (pMax - pMin || 1)) * chartH;
    };

    const drawLine = (ctx: CanvasRenderingContext2D, values: Array<number | null>, color: string, width = 1.3) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      let started = false;
      values.forEach((value, i) => {
        if (value == null || !Number.isFinite(value)) {
          started = false;
          return;
        }
        const x = xAt(i);
        const y = yAt(value);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };

    const drawPaneLine = (
      ctx: CanvasRenderingContext2D,
      values: Array<number | null>,
      color: string,
      top: number,
      height: number,
      min: number,
      max: number,
    ) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      let started = false;
      values.forEach((value, i) => {
        if (value == null || !Number.isFinite(value)) {
          started = false;
          return;
        }
        const x = xAt(i);
        const y = top + ((max - value) / (max - min || 1)) * height;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    };

    const tag = (ctx: CanvasRenderingContext2D, label: string, color: string, y: number, width: number) => {
      ctx.fillStyle = color;
      ctx.fillRect(width - 62, y - 6, 54, 12);
      ctx.fillStyle = "#0b1524";
      ctx.textAlign = "center";
      ctx.fillText(label, width - 35, y);
    };

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const box = parent.getBoundingClientRect();
      const width = Math.max(0, Math.floor(box.width));
      const height = Math.max(0, Math.floor(box.height));
      if (width < 8 || height < 8) return;
      canvas.style.display = "block";
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      lastW = width;
      lastH = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      if (!bars.length) {
        ctx.fillStyle = theme.axis;
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No live candles. Start the Dhan data feed.", width / 2, height / 2);
        return;
      }

      const oscillators: { id: string; label: string; min: number; max: number; render: (top: number, h: number) => void }[] = [];
      if (series.rsi.length) {
        oscillators.push({
          id: "rsi",
          label: "RSI",
          min: 0,
          max: 100,
          render: (top, h) => {
            ctx.strokeStyle = "rgba(248,250,252,0.12)";
            [30, 70].forEach((level) => {
              const y = top + ((100 - level) / 100) * h;
              ctx.beginPath();
              ctx.moveTo(8, y);
              ctx.lineTo(width - 64, y);
              ctx.stroke();
            });
            drawPaneLine(ctx, series.rsi, theme.rsi, top, h, 0, 100);
          },
        });
      }
      if (series.stoch) {
        oscillators.push({
          id: "stoch",
          label: "STOCH",
          min: 0,
          max: 100,
          render: (top, h) => {
            drawPaneLine(ctx, series.stoch!.k, theme.stoch, top, h, 0, 100);
            drawPaneLine(ctx, series.stoch!.d, theme.signal, top, h, 0, 100);
          },
        });
      }
      if (series.willr.length) {
        oscillators.push({
          id: "willr",
          label: "%R",
          min: -100,
          max: 0,
          render: (top, h) => drawPaneLine(ctx, series.willr, theme.willr, top, h, -100, 0),
        });
      }
      if (series.macd) {
        const vals = [...series.macd.line, ...series.macd.signal, ...series.macd.hist].filter(
          (value): value is number => value != null,
        );
        const ext = Math.max(1, ...vals.map((value) => Math.abs(value)));
        oscillators.push({
          id: "macd",
          label: "MACD",
          min: -ext,
          max: ext,
          render: (top, h) => {
            const barW = Math.max(1, ((width - 72) / bars.length) * 0.5);
            series.macd!.hist.forEach((value, i) => {
              if (value == null) return;
              const mid = top + h / 2;
              const y = top + ((ext - value) / (ext * 2)) * h;
              ctx.fillStyle = value >= 0 ? theme.volumeUp : theme.volumeDown;
              ctx.fillRect(xAt(i) - barW / 2, Math.min(mid, y), barW, Math.max(1, Math.abs(y - mid)));
            });
            drawPaneLine(ctx, series.macd!.line, theme.macd, top, h, -ext, ext);
            drawPaneLine(ctx, series.macd!.signal, theme.signal, top, h, -ext, ext);
          },
        });
      }
      if (series.atr.length) {
        const vals = finiteExtent(series.atr, [0, 1]);
        oscillators.push({
          id: "atr",
          label: "ATR",
          min: 0,
          max: Math.max(...vals) * 1.1,
          render: (top, h) => drawPaneLine(ctx, series.atr, theme.atr, top, h, 0, Math.max(...vals) * 1.1),
        });
      }
      if (series.adx) {
        oscillators.push({
          id: "adx",
          label: "ADX",
          min: 0,
          max: 100,
          render: (top, h) => {
            drawPaneLine(ctx, series.adx!.adx, theme.adx, top, h, 0, 100);
            drawPaneLine(ctx, series.adx!.plusDi, theme.stUp, top, h, 0, 100);
            drawPaneLine(ctx, series.adx!.minusDi, theme.stDown, top, h, 0, 100);
          },
        });
      }
      if (series.cci.length) {
        const vals = finiteExtent(series.cci, [-100, 100]);
        const ext = Math.max(200, ...vals.map((value) => Math.abs(value)));
        oscillators.push({
          id: "cci",
          label: "CCI",
          min: -ext,
          max: ext,
          render: (top, h) => drawPaneLine(ctx, series.cci, theme.cci, top, h, -ext, ext),
        });
      }
      if (series.obv.length) {
        const vals = finiteExtent(series.obv, [0, 1]);
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        oscillators.push({
          id: "obv",
          label: "OBV",
          min,
          max,
          render: (top, h) => drawPaneLine(ctx, series.obv, theme.obv, top, h, min, max),
        });
      }

      const pad = { top: 16, right: 64, bottom: 22, left: 8 };
      const showVol = Boolean(indicators?.volume);
      const oscH = oscillators.length ? Math.max(36, Math.min(54, height * 0.14)) : 0;
      const volumeH = showVol ? Math.max(28, height * 0.12) : 0;
      const gaps = (showVol ? 8 : 0) + (oscillators.length ? 6 : 0);
      const chartH = Math.max(48, height - pad.top - pad.bottom - volumeH - oscH * oscillators.length - gaps);
      const chartW = width - pad.left - pad.right;
      const overlayVals = [
        ...bars.flatMap((row) => [row.high, row.low]),
        ...series.ema9,
        ...series.ema21,
        ...series.ema50,
        ...series.sma20,
        ...series.sma50,
        ...series.sma200,
        ...series.wma20,
        ...series.vwap,
        ...(series.bb ? [...series.bb.upper, ...series.bb.lower] : []),
        ...(series.supertrend?.line || []),
        ...series.psar,
        ...(series.pivots ? Object.values(series.pivots) : []),
      ];
      const nums = overlayVals.filter((value): value is number => value != null && Number.isFinite(value));
      const minP0 = Math.min(...nums);
      const maxP0 = Math.max(...nums);
      const pricePad = (maxP0 - minP0) * 0.08 || 1;
      const pMin = minP0 - pricePad;
      const pMax = maxP0 + pricePad;
      geoRef.current = { pad, chartH, chartW, pMin, pMax, n: bars.length, priceBottom: pad.top + chartH };

      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 1;
      ctx.font = "10px Inter, system-ui, sans-serif";
      ctx.fillStyle = theme.axis;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";

      const steps = 5;
      for (let i = 0; i <= steps; i += 1) {
        const price = pMax - ((pMax - pMin) * i) / steps;
        const y = yAt(price);
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(width - pad.right, y);
        ctx.stroke();
        ctx.fillText(price.toLocaleString("en-IN", { maximumFractionDigits: 0 }), width - 8, y);
      }

      const candleW = Math.max(2, (chartW / bars.length) * 0.62);
      const lineCloses = closes(bars);

      if (chartType === "line" || chartType === "area") {
        ctx.beginPath();
        ctx.strokeStyle = theme.ema21;
        ctx.lineWidth = 1.4;
        lineCloses.forEach((value, i) => {
          const x = xAt(i);
          const y = yAt(value);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        if (chartType === "area") {
          ctx.lineTo(xAt(bars.length - 1), pad.top + chartH);
          ctx.lineTo(xAt(0), pad.top + chartH);
          ctx.closePath();
          ctx.fillStyle = "rgba(96,165,250,0.16)";
          ctx.fill();
        }
      } else {
        bars.forEach((candle, i) => {
          const x = xAt(i);
          const up = candle.close >= candle.open;
          ctx.strokeStyle = up ? theme.up : theme.down;
          ctx.fillStyle = up ? theme.up : theme.down;
          ctx.beginPath();
          ctx.moveTo(x, yAt(candle.high));
          ctx.lineTo(x, yAt(candle.low));
          ctx.stroke();
          const yBody = yAt(Math.max(candle.open, candle.close));
          const hBody = Math.max(1, Math.abs(yAt(candle.open) - yAt(candle.close)));
          if (chartType === "bar") {
            ctx.beginPath();
            ctx.moveTo(x - candleW / 2, yAt(candle.open));
            ctx.lineTo(x, yAt(candle.open));
            ctx.moveTo(x, yAt(candle.close));
            ctx.lineTo(x + candleW / 2, yAt(candle.close));
            ctx.stroke();
          } else {
            ctx.fillRect(x - candleW / 2, yBody, candleW, hBody);
          }
        });
      }

      if (series.bb) {
        ctx.fillStyle = "rgba(148,163,184,0.08)";
        ctx.beginPath();
        let started = false;
        series.bb.upper.forEach((value, i) => {
          if (value == null) return;
          const x = xAt(i);
          const y = yAt(value);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        });
        for (let i = series.bb.lower.length - 1; i >= 0; i -= 1) {
          const value = series.bb.lower[i];
          if (value == null) continue;
          ctx.lineTo(xAt(i), yAt(value));
        }
        ctx.closePath();
        ctx.fill();
        drawLine(ctx, series.bb.mid, theme.bb);
        drawLine(ctx, series.bb.upper, theme.bb, 1);
        drawLine(ctx, series.bb.lower, theme.bb, 1);
      }

      if (series.ema9.length) drawLine(ctx, series.ema9, theme.ema9);
      if (series.ema21.length) drawLine(ctx, series.ema21, theme.ema21);
      if (series.ema50.length) drawLine(ctx, series.ema50, theme.ema50);
      if (series.sma20.length) drawLine(ctx, series.sma20, theme.sma20);
      if (series.sma50.length) drawLine(ctx, series.sma50, theme.sma50);
      if (series.sma200.length) drawLine(ctx, series.sma200, theme.sma200);
      if (series.wma20.length) drawLine(ctx, series.wma20, theme.wma20);
      if (series.vwap.length) drawLine(ctx, series.vwap, theme.vwap);
      if (series.supertrend) {
        series.supertrend.line.forEach((value, i) => {
          const next = series.supertrend!.line[i + 1];
          if (value == null || next == null) return;
          ctx.strokeStyle = (series.supertrend!.dir[i] || 1) === 1 ? theme.stUp : theme.stDown;
          ctx.beginPath();
          ctx.moveTo(xAt(i), yAt(value));
          ctx.lineTo(xAt(i + 1), yAt(next));
          ctx.stroke();
        });
      }
      if (series.psar.length) {
        ctx.fillStyle = theme.psar;
        series.psar.forEach((value, i) => {
          if (value == null) return;
          ctx.beginPath();
          ctx.arc(xAt(i), yAt(value), 1.6, 0, Math.PI * 2);
          ctx.fill();
        });
      }
      if (series.pivots) {
        ctx.setLineDash([4, 3]);
        Object.entries(series.pivots).forEach(([key, price]) => {
          const y = yAt(price);
          ctx.strokeStyle = key === "p" ? "#e2e8f0" : theme.pivot;
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(width - pad.right, y);
          ctx.stroke();
          ctx.fillStyle = theme.axis;
          ctx.textAlign = "left";
          ctx.fillText(key.toUpperCase(), pad.left + 4, y - 6);
        });
        ctx.setLineDash([]);
      }

      [
        ["EMA9", series.ema9, theme.ema9],
        ["EMA21", series.ema21, theme.ema21],
        ["VWAP", series.vwap, theme.vwap],
      ].forEach(([, values, color]) => {
        const value = lastNum(values as Array<number | null>);
        if (value == null) return;
        tag(ctx, Number(value).toFixed(0), color as string, yAt(value), width);
      });

      let cursor = pad.top + chartH + 8;
      if (showVol) {
        const vols = candles.map((row) => Number(row.volume) || 0);
        const maxV = Math.max(1, ...vols);
        candles.forEach((candle, i) => {
          const x = xAt(i);
          const h = (vols[i] / maxV) * volumeH;
          ctx.fillStyle = candle.close >= candle.open ? theme.volumeUp : theme.volumeDown;
          ctx.fillRect(x - candleW / 2, cursor + volumeH - h, candleW, h);
        });
        ctx.fillStyle = theme.axis;
        ctx.textAlign = "left";
        ctx.fillText("VOL", pad.left, cursor + 8);
        cursor += volumeH + 6;
      }

      oscillators.forEach((pane) => {
        ctx.fillStyle = "rgba(148,163,184,0.06)";
        ctx.fillRect(pad.left, cursor, chartW, oscH);
        pane.render(cursor, oscH);
        ctx.fillStyle = theme.axis;
        ctx.textAlign = "left";
        ctx.fillText(pane.label, pad.left, cursor + 8);
        cursor += oscH + 4;
      });

      const arrowHead = (x0: number, y0: number, x1: number, y1: number) => {
        const angle = Math.atan2(y1 - y0, x1 - x0);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - 8 * Math.cos(angle - 0.4), y1 - 8 * Math.sin(angle - 0.4));
        ctx.lineTo(x1 - 8 * Math.cos(angle + 0.4), y1 - 8 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fill();
      };

      const paintDrawing = (
        row: ChartDrawing | { kind: "draft"; tool: ChartTool; i0: number; p0: number; i1: number; p1: number; i2?: number; p2?: number },
      ) => {
        ctx.strokeStyle = theme.draw;
        ctx.fillStyle = theme.draw;
        ctx.lineWidth = 1.2;
        const kind = row.kind === "draft" ? row.tool : row.kind;
        ctx.setLineDash(kind === "measure" ? [4, 3] : []);
        if (kind === "hline" && "price" in row) {
          const y = yAt(row.price);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(width - pad.right, y);
          ctx.stroke();
          ctx.fillText(row.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }), pad.left + 4, y - 6);
        } else if (kind === "vline" && "i" in row) {
          const x = xAt(row.i);
          ctx.beginPath();
          ctx.moveTo(x, pad.top);
          ctx.lineTo(x, pad.top + chartH);
          ctx.stroke();
        } else if (kind === "text" && "text" in row) {
          ctx.fillText(row.text, xAt(row.i) + 4, yAt(row.price) - 4);
        } else if (kind === "fib" && "i0" in row) {
          ctx.setLineDash([]);
          FIB_LEVELS.forEach((level) => {
            const price = row.p0 + (row.p1 - row.p0) * level;
            const y = yAt(price);
            ctx.strokeStyle = theme.fib;
            ctx.beginPath();
            ctx.moveTo(xAt(row.i0), y);
            ctx.lineTo(xAt(row.i1), y);
            ctx.stroke();
            ctx.fillStyle = theme.fib;
            ctx.textAlign = "left";
            ctx.fillText(`${(level * 100).toFixed(1)}%  ${price.toFixed(1)}`, Math.min(xAt(row.i0), xAt(row.i1)) + 4, y - 5);
          });
        } else if (kind === "channel" && "i0" in row) {
          const x0 = xAt(row.i0);
          const y0 = yAt(row.p0);
          const x1 = xAt(row.i1);
          const y1 = yAt(row.p1);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
          if ("i2" in row && row.i2 != null && row.p2 != null) {
            const x2 = xAt(row.i2);
            const y2 = yAt(row.p2);
            const dx = x1 - x0;
            const dy = y1 - y0;
            const t = ((x2 - x0) * dx + (y2 - y0) * dy) / ((dx * dx + dy * dy) || 1);
            const px = x0 + t * dx;
            const py = y0 + t * dy;
            const ox = x2 - px;
            const oy = y2 - py;
            ctx.beginPath();
            ctx.moveTo(x0 + ox, y0 + oy);
            ctx.lineTo(x1 + ox, y1 + oy);
            ctx.stroke();
          }
        } else if ("i0" in row && "p0" in row && "i1" in row) {
          let x0 = xAt(row.i0);
          let y0 = yAt(row.p0);
          let x1 = xAt(row.i1);
          let y1 = yAt(row.p1);
          if (kind === "ray") {
            const dx = x1 - x0 || 1e-6;
            const dy = y1 - y0;
            const xEnd = width - pad.right;
            const t = (xEnd - x0) / dx;
            x1 = xEnd;
            y1 = y0 + dy * t;
          }
          if (kind === "rect") {
            const x = Math.min(x0, x1);
            const y = Math.min(y0, y1);
            ctx.fillStyle = "rgba(248,250,252,0.08)";
            ctx.fillRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
            ctx.strokeRect(x, y, Math.abs(x1 - x0), Math.abs(y1 - y0));
          } else {
            ctx.beginPath();
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y1);
            ctx.stroke();
            if (kind === "arrow") arrowHead(x0, y0, x1, y1);
            if (kind === "measure") {
              const barsN = Math.abs(row.i1 - row.i0);
              const diff = row.p1 - row.p0;
              ctx.fillText(`${barsN} bars · ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`, (x0 + x1) / 2, (y0 + y1) / 2 - 8);
            }
          }
        }
        ctx.setLineDash([]);
      };

      drawings.forEach((row) => paintDrawing(row));
      const draft = draftRef.current;
      const hover = hoverRef.current;
      if (draft && hover) {
        paintDrawing({
          kind: "draft",
          tool: draft.kind,
          i0: draft.i0,
          p0: draft.p0,
          i1: draft.i1 ?? hover.i,
          p1: draft.p1 ?? hover.price,
          i2: draft.i1 != null ? hover.i : undefined,
          p2: draft.i1 != null ? hover.price : undefined,
        });
      }

      if (hover && tool === "crosshair") {
        const bar = bars[hover.i];
        ctx.strokeStyle = theme.cross;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(hover.x, pad.top);
        ctx.lineTo(hover.x, pad.top + chartH);
        ctx.moveTo(pad.left, hover.y);
        ctx.lineTo(width - pad.right, hover.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (bar) {
          ctx.fillStyle = "rgba(7,24,51,0.82)";
          ctx.fillRect(pad.left, 2, 268, 14);
          ctx.fillStyle = "#e2e8f0";
          ctx.textAlign = "left";
          ctx.fillText(
            `O ${bar.open.toFixed(2)}  H ${bar.high.toFixed(2)}  L ${bar.low.toFixed(2)}  C ${bar.close.toFixed(2)}`,
            pad.left + 4,
            9,
          );
        }
      }
    };

    const snap = (point: Hover) => {
      if (!point || !magnet) return point;
      const bar = bars[point.i];
      if (!bar) return point;
      const prices = [bar.open, bar.high, bar.low, bar.close];
      let best = prices[0];
      let dist = Math.abs(point.price - best);
      prices.forEach((price) => {
        const next = Math.abs(point.price - price);
        if (next < dist) {
          dist = next;
          best = price;
        }
      });
      return { ...point, price: best };
    };

    const pointFromEvent = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const { pad, chartW, chartH, pMin, pMax, n } = geoRef.current;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - pad.left) / (chartW || 1)) * n - 0.5)));
      const price = pMax - ((y - pad.top) / (chartH || 1)) * (pMax - pMin);
      return snap({ i, price, x, y });
    };

    const onMove = (event: PointerEvent) => {
      hoverRef.current = pointFromEvent(event);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    const onLeave = () => {
      hoverRef.current = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    const onClick = (event: PointerEvent) => {
      if (!onDrawingsChange || !bars.length) return;
      const point = pointFromEvent(event);
      if (!point) return;
      if (point.y > geoRef.current.priceBottom + 4 && tool !== "crosshair") return;
      if (tool === "crosshair") return;
      if (tool === "hline") {
        onDrawingsChange([...drawings, { id: uid(), kind: "hline", price: point.price }]);
        return;
      }
      if (tool === "vline") {
        onDrawingsChange([...drawings, { id: uid(), kind: "vline", i: point.i }]);
        return;
      }
      if (tool === "text") {
        const text = window.prompt("Label");
        if (!text) return;
        onDrawingsChange([...drawings, { id: uid(), kind: "text", i: point.i, price: point.price, text }]);
        return;
      }
      const draft = draftRef.current;
      if (!draft) {
        draftRef.current = { kind: tool, i0: point.i, p0: point.price };
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
        return;
      }
      if (tool === "channel" && draft.i1 == null) {
        draftRef.current = { ...draft, i1: point.i, p1: point.price };
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(draw);
        return;
      }
      const next: ChartDrawing =
        tool === "channel"
          ? { id: uid(), kind: "channel", i0: draft.i0, p0: draft.p0, i1: draft.i1 ?? point.i, p1: draft.p1 ?? point.price, i2: point.i, p2: point.price }
          : tool === "rect"
            ? { id: uid(), kind: "rect", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
            : tool === "fib"
              ? { id: uid(), kind: "fib", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
              : tool === "measure"
                ? { id: uid(), kind: "measure", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
                : tool === "ray"
                  ? { id: uid(), kind: "ray", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
                  : tool === "arrow"
                    ? { id: uid(), kind: "arrow", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
                    : { id: uid(), kind: "trend", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price };
      draftRef.current = null;
      onDrawingsChange([...drawings, next]);
    };

    draw();
    const observer = new ResizeObserver(() => {
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      if (width === lastW && height === lastH) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    });
    observer.observe(parent);
    const onContext = (event: Event) => {
      event.preventDefault();
      draftRef.current = null;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };

    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("pointerdown", onClick);
    canvas.addEventListener("contextmenu", onContext);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onClick);
      canvas.removeEventListener("contextmenu", onContext);
    };
  }, [bars, candles, chartType, drawings, indicators, magnet, onDrawingsChange, series, theme, tool]);

  return (
    <canvas
      ref={canvasRef}
      className={tool === "crosshair" || tool === "hline" || tool === "vline" ? "block max-h-full max-w-full cursor-crosshair" : "block max-h-full max-w-full cursor-cell"}
    />
  );
}
