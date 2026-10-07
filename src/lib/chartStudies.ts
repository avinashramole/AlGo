export type ChartType = "candle" | "heikin" | "bar" | "line" | "area";

export type ChartTool =
  | "crosshair"
  | "hline"
  | "vline"
  | "trend"
  | "ray"
  | "rect"
  | "channel"
  | "fib"
  | "text"
  | "measure"
  | "arrow";

export type ChartDrawing =
  | { id: string; kind: "hline"; price: number }
  | { id: string; kind: "vline"; i: number }
  | { id: string; kind: "trend"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "ray"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "arrow"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "measure"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "fib"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "rect"; i0: number; p0: number; i1: number; p1: number }
  | { id: string; kind: "channel"; i0: number; p0: number; i1: number; p1: number; i2: number; p2: number }
  | { id: string; kind: "text"; i: number; price: number; text: string };

export type ChartIndicators = {
  ema9: boolean;
  ema21: boolean;
  ema50: boolean;
  sma20: boolean;
  sma50: boolean;
  sma200: boolean;
  wma20: boolean;
  vwap: boolean;
  bb: boolean;
  supertrend: boolean;
  psar: boolean;
  pivots: boolean;
  rsi: boolean;
  macd: boolean;
  stoch: boolean;
  atr: boolean;
  adx: boolean;
  cci: boolean;
  willr: boolean;
  obv: boolean;
  volume: boolean;
};

export const DEFAULT_INDICATORS: ChartIndicators = {
  ema9: false,
  ema21: false,
  ema50: false,
  sma20: false,
  sma50: false,
  sma200: false,
  wma20: false,
  vwap: false,
  bb: false,
  supertrend: false,
  psar: false,
  pivots: false,
  rsi: false,
  macd: false,
  stoch: false,
  atr: false,
  adx: false,
  cci: false,
  willr: false,
  obv: false,
  volume: false,
};

export const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candle", label: "Candle" },
  { id: "heikin", label: "Heikin" },
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
];

export const STUDY_GROUPS: { title: string; items: { id: keyof ChartIndicators; label: string; color: string }[] }[] = [
  {
    title: "Overlays",
    items: [
      { id: "ema9", label: "EMA 9", color: "#fd6b01" },
      { id: "ema21", label: "EMA 21", color: "#60a5fa" },
      { id: "ema50", label: "EMA 50", color: "#38bdf8" },
      { id: "sma20", label: "SMA 20", color: "#eab308" },
      { id: "sma50", label: "SMA 50", color: "#f59e0b" },
      { id: "sma200", label: "SMA 200", color: "#fb7185" },
      { id: "wma20", label: "WMA 20", color: "#34d399" },
      { id: "vwap", label: "VWAP", color: "#c084fc" },
      { id: "bb", label: "Bollinger", color: "#94a3b8" },
      { id: "supertrend", label: "Supertrend", color: "#22c55e" },
      { id: "psar", label: "Parabolic SAR", color: "#f97316" },
      { id: "pivots", label: "Pivots", color: "#a3a3a3" },
    ],
  },
  {
    title: "Oscillators",
    items: [
      { id: "volume", label: "Volume", color: "#26a69a" },
      { id: "rsi", label: "RSI 14", color: "#f472b6" },
      { id: "macd", label: "MACD", color: "#818cf8" },
      { id: "stoch", label: "Stochastic", color: "#22d3ee" },
      { id: "atr", label: "ATR 14", color: "#fbbf24" },
      { id: "adx", label: "ADX 14", color: "#fb923c" },
      { id: "cci", label: "CCI 20", color: "#4ade80" },
      { id: "willr", label: "Williams %R", color: "#e879f9" },
      { id: "obv", label: "OBV", color: "#67e8f9" },
    ],
  },
];

export function toolHint(tool: ChartTool, hasCandles: boolean) {
  if (!hasCandles) return "Waiting for live Dhan candles";
  if (tool === "crosshair") return "Hover for OHLC · live Dhan bars";
  if (tool === "hline" || tool === "vline" || tool === "text") return "Click the live chart to place";
  if (tool === "channel") return "Three clicks: line, then offset";
  return "Click twice on the live chart";
}

export function twoClickTool(tool: ChartTool) {
  return tool === "trend" || tool === "ray" || tool === "rect" || tool === "fib" || tool === "measure" || tool === "arrow";
}
