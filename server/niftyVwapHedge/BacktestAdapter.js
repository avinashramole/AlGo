import { sessionKeyIST } from "../niftyVwap/VwapSignalEngine.js";
import { niftyVwapHedgeConfig } from "./config.js";
import { NiftyVwapHedgeStrategy } from "./NiftyVwapHedgeStrategy.js";

function synthOptionLtp(futBar, side, base = 100) {
  const move = Number(futBar.close) - Number(futBar.open);
  const close = Math.max(5, side === "CE" ? base + move * 0.45 : base - move * 0.45);
  return Number(close.toFixed(2));
}

function replayBook() {
  const positions = [];
  const closed = [];
  const orders = [];
  return {
    positions,
    closed,
    orders,
    place(payload) {
      const price = Number(payload.price);
      if (!(price > 0)) return { error: "No fill price" };
      const pos = {
        id: `bt-${payload.role || "p"}-${payload.barTime || Date.now()}`,
        symbol: payload.symbol,
        type: "BUY",
        qty: payload.qty,
        avg: price,
        ltp: price,
        pnl: 0,
        strategy: payload.strategy,
        option: payload.option,
        strike: payload.strike,
        expiry: payload.expiry,
        role: payload.role,
        paper: true,
      };
      positions.push(pos);
      orders.push({ ...payload, status: "FILLED", price, side: "BUY" });
      return { ...pos, status: "FILLED", price };
    },
    exit(position) {
      const idx = positions.findIndex((row) => row.id === position.id);
      if (idx < 0) return { error: "missing" };
      const pos = positions[idx];
      const exit = Number(pos.ltp || pos.avg);
      const pnl = Number(((exit - pos.avg) * pos.qty).toFixed(2));
      closed.push({ ...pos, exit, pnl });
      positions.splice(idx, 1);
      return { ok: true, pnl };
    },
    cancelPending() {
      return { ok: true };
    },
    mark(option, ltp) {
      for (const pos of positions) {
        if (pos.option === option || pos.symbol?.includes(` ${option}`)) {
          pos.ltp = ltp;
          pos.pnl = Number(((ltp - pos.avg) * pos.qty).toFixed(2));
        }
      }
    },
  };
}

export function runNiftyVwapHedgeBacktest(algo, candles = []) {
  const cfg = niftyVwapHedgeConfig(algo);
  algo.hedgeState = undefined;
  const book = replayBook();
  const adapter = {
    mode: "backtest",
    place: (payload) => book.place(payload),
    exit: (position) => book.exit(position),
    cancelPending: () => book.cancelPending(),
  };
  const days = new Map();
  for (const bar of candles) {
    const day = sessionKeyIST(bar.time);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(bar);
  }
  let ceLtp = 100;
  let peLtp = 100;
  for (const [, session] of days) {
    for (let i = 0; i < session.length; i += 1) {
      const bar = session[i];
      const slice = session.slice(0, i + 1);
      const now = Number(bar.time) + cfg.barMinutes * 60 * 1000;
      ceLtp = synthOptionLtp(bar, "CE", ceLtp);
      peLtp = synthOptionLtp(bar, "PE", peLtp);
      book.mark("CE", ceLtp);
      book.mark("PE", peLtp);
      NiftyVwapHedgeStrategy.tick({
        algo,
        config: cfg,
        now,
        feedLive: true,
        futuresBars: slice,
        spot: Number(bar.close),
        step: 50,
        expiry: sessionKeyIST(bar.time),
        ceLtp,
        peLtp,
        capital: 10_00_000,
        positions: book.positions,
        orders: book.orders,
        pending: [],
        adapter,
      });
    }
    while (book.positions[0]) book.exit(book.positions[0]);
  }
  const trades = book.closed;
  const wins = trades.filter((row) => row.pnl > 0).length;
  const pnl = trades.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  return {
    ranAt: new Date().toISOString(),
    timeframe: cfg.timeframe,
    bars: candles.length,
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0,
    pnl: Number(pnl.toFixed(2)),
    maxDrawdown: 0,
    book: trades.slice(-12).map((row) => ({
      side: "BUY",
      entry: Number(row.avg),
      exit: Number(row.exit),
      qty: row.qty,
      pnl: row.pnl,
      bars: 0,
      reason: row.role || row.option,
    })),
  };
}

export const HedgeBacktestAdapter = { run: runNiftyVwapHedgeBacktest };
