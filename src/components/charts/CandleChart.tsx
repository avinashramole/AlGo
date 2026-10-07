import { useEffect, useMemo, useRef } from "react";
import type { Candle } from "../../lib/chartData";
import { closes, ema, sessionVwap, sma } from "../../lib/chartIndicators";

export type ChartTool = "crosshair" | "hline" | "trend" | "rect" | "text" | "measure";

export type ChartDrawing =
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "trend"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "rect"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "text"; i: number; price: number; text: string }
  | { id: string; kind: "measure"; i0: number; p0: number; i1: number; p1: number };

export type ChartIndicators = {
  ema9: boolean;
  ema21: boolean;
  sma20: boolean;
  vwap: boolean;
};

type Props = {
  candles: Candle[];
  dark: boolean;
  tool?: ChartTool;
  indicators?: ChartIndicators;
  drawings?: ChartDrawing[];
  onDrawingsChange?: (next: ChartDrawing[]) => void;
};

type Hover = { i: number; price: number; x: number; y: number } | null;

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function CandleChart({
  candles,
  dark,
  tool = "crosshair",
  indicators,
  drawings = [],
  onDrawingsChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverRef = useRef<Hover>(null);
  const draftRef = useRef<{ kind: ChartTool; i0: number; p0: number } | null>(null);
  const geoRef = useRef({
    pad: { top: 16, right: 64, bottom: 28, left: 8 },
    chartH: 1,
    chartW: 1,
    pMin: 0,
    pMax: 1,
    n: 1,
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
      sma20: "#eab308",
      vwap: "#c084fc",
      draw: "#f8fafc",
    }),
    [dark],
  );

  const series = useMemo(() => {
    const prices = closes(candles);
    return {
      ema9: indicators?.ema9 ? ema(prices, 9) : [],
      ema21: indicators?.ema21 ? ema(prices, 21) : [],
      sma20: indicators?.sma20 ? sma(prices, 20) : [],
      vwap: indicators?.vwap ? sessionVwap(candles) : [],
    };
  }, [candles, indicators]);

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

    const drawLine = (ctx: CanvasRenderingContext2D, values: Array<number | null>, color: string) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
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

      if (!candles.length) {
        ctx.fillStyle = theme.axis;
        ctx.font = "12px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("No live candles. Start the Dhan data feed.", width / 2, height / 2);
        return;
      }

      const pad = { top: 16, right: 64, bottom: 28, left: 8 };
      const volumeH = Math.max(36, height * 0.16);
      const chartH = height - pad.top - pad.bottom - volumeH - 8;
      const chartW = width - pad.left - pad.right;
      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const vols = candles.map((c) => c.volume);
      const minP = Math.min(...lows);
      const maxP = Math.max(...highs);
      const maxV = Math.max(1, ...vols);
      const pricePad = (maxP - minP) * 0.08 || 1;
      const pMin = minP - pricePad;
      const pMax = maxP + pricePad;
      geoRef.current = { pad, chartH, chartW, pMin, pMax, n: candles.length };

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

      const candleW = Math.max(2, (chartW / candles.length) * 0.62);
      candles.forEach((candle, i) => {
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
        ctx.fillRect(x - candleW / 2, yBody, candleW, hBody);
      });

      if (series.ema9.length) drawLine(ctx, series.ema9, theme.ema9);
      if (series.ema21.length) drawLine(ctx, series.ema21, theme.ema21);
      if (series.sma20.length) drawLine(ctx, series.sma20, theme.sma20);
      if (series.vwap.length) drawLine(ctx, series.vwap, theme.vwap);

      const volTop = pad.top + chartH + 12;
      candles.forEach((candle, i) => {
        const x = xAt(i);
        const h = (candle.volume / maxV) * volumeH;
        ctx.fillStyle = candle.close >= candle.open ? theme.volumeUp : theme.volumeDown;
        ctx.fillRect(x - candleW / 2, volTop + volumeH - h, candleW, h);
      });
      ctx.fillStyle = theme.axis;
      ctx.textAlign = "left";
      ctx.fillText("VOL", pad.left, volTop + 8);

      const paintDrawing = (row: ChartDrawing | { kind: "draft"; tool: ChartTool; i0: number; p0: number; i1: number; p1: number }) => {
        ctx.strokeStyle = theme.draw;
        ctx.fillStyle = theme.draw;
        ctx.lineWidth = 1.2;
        ctx.setLineDash(row.kind === "measure" || (row.kind === "draft" && row.tool === "measure") ? [4, 3] : []);
        if (row.kind === "hline") {
          const y = yAt(row.price);
          ctx.beginPath();
          ctx.moveTo(pad.left, y);
          ctx.lineTo(width - pad.right, y);
          ctx.stroke();
          ctx.fillText(row.price.toLocaleString("en-IN", { maximumFractionDigits: 2 }), pad.left + 4, y - 6);
        } else if (row.kind === "trend" || row.kind === "measure" || (row.kind === "draft" && (row.tool === "trend" || row.tool === "measure"))) {
          const a = "i0" in row ? row : row;
          ctx.beginPath();
          ctx.moveTo(xAt(a.i0), yAt(a.p0));
          ctx.lineTo(xAt(a.i1), yAt(a.p1));
          ctx.stroke();
          if (row.kind === "measure" || (row.kind === "draft" && row.tool === "measure")) {
            const bars = Math.abs(a.i1 - a.i0);
            const diff = a.p1 - a.p0;
            ctx.fillText(
              `${bars} bars · ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`,
              (xAt(a.i0) + xAt(a.i1)) / 2,
              (yAt(a.p0) + yAt(a.p1)) / 2 - 8,
            );
          }
        } else if (row.kind === "rect" || (row.kind === "draft" && row.tool === "rect")) {
          const a = row;
          const x = Math.min(xAt(a.i0), xAt(a.i1));
          const y = Math.min(yAt(a.p0), yAt(a.p1));
          const w = Math.abs(xAt(a.i1) - xAt(a.i0));
          const h = Math.abs(yAt(a.p1) - yAt(a.p0));
          ctx.fillStyle = "rgba(248,250,252,0.08)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
        } else if (row.kind === "text") {
          ctx.fillText(row.text, xAt(row.i) + 4, yAt(row.price) - 4);
        }
        ctx.setLineDash([]);
      };

      drawings.forEach((row) => paintDrawing(row));
      const draft = draftRef.current;
      const hover = hoverRef.current;
      if (draft && hover) {
        paintDrawing({ kind: "draft", tool: draft.kind, i0: draft.i0, p0: draft.p0, i1: hover.i, p1: hover.price });
      }

      if (hover && tool === "crosshair") {
        const bar = candles[hover.i];
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
          ctx.fillRect(pad.left, 2, 220, 14);
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

    const pointFromEvent = (event: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const { pad, chartW, chartH, pMin, pMax, n } = geoRef.current;
      const i = Math.max(0, Math.min(n - 1, Math.round(((x - pad.left) / (chartW || 1)) * n - 0.5)));
      const price = pMax - ((y - pad.top) / (chartH || 1)) * (pMax - pMin);
      return { i, price, x, y };
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
      if (!onDrawingsChange || !candles.length) return;
      const point = pointFromEvent(event);
      if (tool === "crosshair") return;
      if (tool === "hline") {
        onDrawingsChange([...drawings, { id: uid(), kind: "hline", price: point.price }]);
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
      const next: ChartDrawing =
        draft.kind === "rect"
          ? { id: uid(), kind: "rect", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
          : draft.kind === "measure"
            ? { id: uid(), kind: "measure", i0: draft.i0, p0: draft.p0, i1: point.i, p1: point.price }
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
  }, [candles, drawings, onDrawingsChange, series, theme, tool]);

  return (
    <canvas
      ref={canvasRef}
      className={tool === "crosshair" || tool === "hline" ? "block max-h-full max-w-full cursor-crosshair" : "block max-h-full max-w-full cursor-cell"}
    />
  );
}
