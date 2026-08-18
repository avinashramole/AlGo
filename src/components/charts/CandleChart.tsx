import { useEffect, useMemo, useRef } from "react";
import type { Candle } from "../../lib/chartData";

type Props = {
  candles: Candle[];
  dark: boolean;
};

export function CandleChart({ candles, dark }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const theme = useMemo(
    () => ({
      up: "#12b76a",
      down: "#f04438",
      grid: dark ? "rgba(148,163,184,0.12)" : "rgba(148,163,184,0.28)",
      axis: dark ? "#94a3b8" : "#64748b",
      volumeUp: "rgba(18,183,106,0.28)",
      volumeDown: "rgba(240,68,56,0.28)",
    }),
    [dark],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || candles.length === 0) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const pad = { top: 16, right: 64, bottom: 28, left: 8 };
      const volumeH = Math.max(48, height * 0.18);
      const chartH = height - pad.top - pad.bottom - volumeH - 8;
      const chartW = width - pad.left - pad.right;

      const highs = candles.map((c) => c.high);
      const lows = candles.map((c) => c.low);
      const vols = candles.map((c) => c.volume);
      const minP = Math.min(...lows);
      const maxP = Math.max(...highs);
      const maxV = Math.max(...vols);
      const pricePad = (maxP - minP) * 0.08 || 1;
      const pMin = minP - pricePad;
      const pMax = maxP + pricePad;

      const xAt = (i: number) => pad.left + (i + 0.5) * (chartW / candles.length);
      const yAt = (price: number) => pad.top + ((pMax - price) / (pMax - pMin)) * chartH;
      const candleW = Math.max(2, (chartW / candles.length) * 0.62);

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
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [candles, theme]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
