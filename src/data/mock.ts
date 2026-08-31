export type IndexQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  spark: number[];
  future?: number;
  vwap?: number;
  futureVwap?: number;
  prevClose?: number;
};

export type Position = {
  id: string;
  symbol: string;
  type: "BUY" | "SELL";
  qty: number;
  avg: number;
  ltp: number;
  pnl: number;
  brokerId?: string;
};

export type Algo = {
  id: string;
  name: string;
  tag: string;
  kind?: "indicator" | "price-action" | "nifty-vwap";
  symbol?: string;
  side?: "BUY" | "SELL" | "BOTH";
  qty?: number;
  lots?: number;
  lotSize?: number;
  timeframe?: string;
  slPct?: number;
  targetPct?: number;
  indicator?: string;
  period?: number;
  fast?: number;
  slow?: number;
  rsiBuy?: number;
  rsiSell?: number;
  multiplier?: number;
  pattern?: string;
  rangeMinutes?: number;
  lookback?: number;
  buyLeft?: string;
  buyOp?: string;
  buyRight?: string;
  buyValue?: number;
  sellLeft?: string;
  sellOp?: string;
  sellRight?: string;
  sellValue?: number;
  summary?: string;
  runMode?: "live" | "paper" | "backtest";
  instrument?: "future" | "option";
  optionType?: "CE" | "PE";
  strikeOffset?: number;
  status: "LIVE" | "PAUSED" | "PAPER" | "BACKTEST";
  pnl: number;
  winRate: number;
  enabled: boolean;
  brokerId?: string;
};

export type Signal = {
  id: string;
  action: "BUY" | "SELL";
  symbol: string;
  strategy: string;
  time: string;
  confidence: number;
};

export type OptionRow = {
  strike: number;
  callLtp: number;
  callChg: number;
  putLtp: number;
  putChg: number;
  atm?: boolean;
};

export const indices: IndexQuote[] = [
  {
    symbol: "NIFTY 50",
    name: "NIFTY",
    price: 24580.25,
    change: 125.4,
    changePct: 0.51,
    future: 24602.4,
    vwap: 24571.15,
    prevClose: 24454.85,
    spark: [24420, 24455, 24410, 24480, 24510, 24490, 24540, 24580],
  },
  {
    symbol: "BANKNIFTY",
    name: "BANKNIFTY",
    price: 52140.8,
    change: 210.15,
    changePct: 0.4,
    future: 52186.4,
    vwap: 52118.7,
    prevClose: 51930.65,
    spark: [51880, 51940, 51910, 52020, 52080, 52040, 52110, 52141],
  },
  {
    symbol: "FINNIFTY",
    name: "FINNIFTY",
    price: 24890.5,
    change: 98.2,
    changePct: 0.4,
    future: 24912.8,
    vwap: 24881.4,
    prevClose: 24792.3,
    spark: [24740, 24780, 24755, 24810, 24840, 24820, 24870, 24891],
  },
  {
    symbol: "SENSEX",
    name: "SENSEX",
    price: 80642.3,
    change: 312.8,
    changePct: 0.39,
    future: 80718.6,
    vwap: 80610.2,
    prevClose: 80329.5,
    spark: [80210, 80340, 80280, 80420, 80510, 80470, 80590, 80642],
  },
  {
    symbol: "INDIA VIX",
    name: "VIX",
    price: 13.24,
    change: -0.42,
    changePct: -3.07,
    spark: [13.9, 13.72, 13.8, 13.55, 13.48, 13.4, 13.3, 13.24],
  },
];

export const ohlc = {
  open: 24462.1,
  high: 24612.8,
  low: 24418.35,
  close: 24580.25,
};

export const dnaScores = [
  { label: "Trend", value: 86 },
  { label: "Momentum", value: 78 },
  { label: "Buy Pressure", value: 91 },
  { label: "Volatility", value: 34 },
  { label: "OI Build", value: 72 },
  { label: "PCR", value: 64 },
];

export const optionChain: OptionRow[] = [
  { strike: 24400, callLtp: 212.4, callChg: 8.2, putLtp: 38.15, putChg: -11.4 },
  { strike: 24500, callLtp: 142.75, callChg: 6.8, putLtp: 62.4, putChg: -8.1, atm: true },
  { strike: 24600, callLtp: 88.2, callChg: 4.1, putLtp: 104.55, putChg: -5.6 },
];

export const initialAlgos: Algo[] = [
  {
    id: "a4",
    name: "NIFTY VWAP ATM",
    tag: "NIFTY VWAP",
    kind: "nifty-vwap",
    symbol: "NIFTY",
    instrument: "option",
    optionType: "CE",
    strikeOffset: 0,
    indicator: "VWAP",
    timeframe: "5m",
    side: "BUY",
    lots: 1,
    lotSize: 65,
    qty: 65,
    slPct: 20,
    targetPct: 40,
    summary: "NIFTY VWAP ATM · 5m options · SL 20% / TGT 40%",
    status: "PAUSED",
    pnl: 0,
    winRate: 0,
    enabled: false,
    brokerId: "paper",
    runMode: "paper",
  },
];

export const positions: Position[] = [
  { id: "p1", symbol: "NIFTY 24500 CE", type: "BUY", qty: 65, avg: 128.4, ltp: 142.75, pnl: 1076.25, brokerId: "dhan" },
  { id: "p2", symbol: "BANKNIFTY 52100 PE", type: "SELL", qty: 30, avg: 186.2, ltp: 164.5, pnl: 651.0, brokerId: "dhan" },
  { id: "p3", symbol: "NIFTY 24600 CE", type: "BUY", qty: 50, avg: 74.1, ltp: 88.2, pnl: 705.0, brokerId: "dhan" },
  { id: "p4", symbol: "FINNIFTY 24900 CE", type: "BUY", qty: 60, avg: 96.8, ltp: 118.4, pnl: 1296.0, brokerId: "dhan" },
  { id: "p5", symbol: "SENSEX 80600 CE", type: "BUY", qty: 20, avg: 142.0, ltp: 168.35, pnl: 527.0, brokerId: "dhan" },
  { id: "p6", symbol: "NIFTY 24400 PE", type: "SELL", qty: 50, avg: 52.6, ltp: 38.15, pnl: 722.5, brokerId: "dhan" },
];

export const recentSignals: Signal[] = [
  { id: "s1", action: "BUY", symbol: "NIFTY 24500 CE", strategy: "VWAP Depth", time: "09:28:14", confidence: 91 },
  { id: "s2", action: "SELL", symbol: "BANKNIFTY 52200 CE", strategy: "Mean Revert", time: "09:21:02", confidence: 77 },
  { id: "s3", action: "BUY", symbol: "FINNIFTY 24900 CE", strategy: "Momentum Rider", time: "09:16:41", confidence: 84 },
  { id: "s4", action: "BUY", symbol: "NIFTY 24600 CE", strategy: "ORB Breakout", time: "09:12:08", confidence: 72 },
  { id: "s5", action: "SELL", symbol: "INDIA VIX FUT", strategy: "Vol Crush", time: "09:08:55", confidence: 69 },
];

export const watchlist = [
  { symbol: "RELIANCE", ltp: 2984.2, chg: 1.12 },
  { symbol: "HDFCBANK", ltp: 1672.4, chg: 0.64 },
  { symbol: "ICICIBANK", ltp: 1238.9, chg: 0.41 },
  { symbol: "INFY", ltp: 1864.15, chg: -0.28 },
  { symbol: "TCS", ltp: 4128.6, chg: -0.14 },
  { symbol: "SBIN", ltp: 812.35, chg: 1.04 },
  { symbol: "BHARTIARTL", ltp: 1542.8, chg: 0.72 },
  { symbol: "ITC", ltp: 492.15, chg: -0.36 },
];

export const fiiDii = {
  fii: { buy: 12480, sell: 10840, net: 1640 },
  dii: { buy: 9860, sell: 8420, net: 1440 },
};

export const marketWatch = [
  { symbol: "NIFTY 50", ltp: 24580.25, chg: 0.51, volume: "182.4 Cr" },
  { symbol: "BANKNIFTY", ltp: 52140.8, chg: 0.4, volume: "96.1 Cr" },
  { symbol: "RELIANCE", ltp: 2984.2, chg: 1.12, volume: "48.2 L" },
  { symbol: "HDFCBANK", ltp: 1672.4, chg: 0.64, volume: "62.8 L" },
  { symbol: "ICICIBANK", ltp: 1238.9, chg: 0.41, volume: "54.1 L" },
  { symbol: "INFY", ltp: 1864.15, chg: -0.28, volume: "31.6 L" },
  { symbol: "TCS", ltp: 4128.6, chg: -0.14, volume: "18.4 L" },
  { symbol: "SBIN", ltp: 812.35, chg: 1.04, volume: "71.2 L" },
  { symbol: "LT", ltp: 3612.4, chg: 0.88, volume: "12.9 L" },
  { symbol: "AXISBANK", ltp: 1174.5, chg: 0.22, volume: "28.7 L" },
];
