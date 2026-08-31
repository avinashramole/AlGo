import { niftyVwapConfig } from "./config.js";
import { OptionStrikeSelector } from "./OptionStrikeSelector.js";
import { sessionKeyIST, sessionVwap } from "./VwapSignalEngine.js";
import { NiftyVwapStrategy } from "./NiftyVwapStrategy.js";

function synthOptionBar(futBar, side, base = 120) {
  const move = Number(futBar.close) - Number(futBar.open);
  const delta = 0.45;
  const close = Math.max(8, side === "CE" ? base + move * delta : base - move * delta);
  const open = Math.max(8, side === "CE" ? base : base);
  return {
    time: futBar.time,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: Number(futBar.volume || 1000),
  };
}

function replayFillBook() {
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
      const existing = positions.find((row) => row.strategy === payload.strategy);
      if (existing) return { error: "duplicate" };
      const pos = {
        id: `bt-${payload.barTime || Date.now()}`,
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
        paper: true,
      };
      positions.push(pos);
      orders.push({ ...payload, status: "FILLED", price });
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
    mark(symbol, ltp) {
      for (const pos of positions) {
        if (pos.symbol === symbol) {
          pos.ltp = ltp;
          pos.pnl = Number(((ltp - pos.avg) * pos.qty).toFixed(2));
        }
      }
    },
  };
}

export function runNiftyVwapBacktest(algo, candles = []) {
  const cfg = niftyVwapConfig(algo);
  const book = replayFillBook();
  const adapter = {
    mode: "backtest",
    place: (payload) => book.place(payload),
    exit: (position) => book.exit(position),
  };
  const ceBars = [];
  const peBars = [];
  const days = new Map();

  for (const bar of candles) {
    const day = sessionKeyIST(bar.time);
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(bar);
  }

  const futAll = [];
  for (const [, session] of days) {
    ceBars.length = 0;
    peBars.length = 0;
    for (let i = 0; i < session.length; i += 1) {
      const bar = session[i];
      futAll.push(bar);
      ceBars.push(synthOptionBar(bar, "CE"));
      peBars.push(synthOptionBar(bar, "PE"));
      const slice = session.slice(0, i + 1);
      const spot = Number(bar.close);
      const strike = OptionStrikeSelector.atmStrike(spot, 50);
      const now = Number(bar.time) + cfg.barMinutes * 60 * 1000;
      const ceLtp = ceBars[ceBars.length - 1].close;
      const peLtp = peBars[peBars.length - 1].close;
      book.mark(`${cfg.symbol} ${strike} CE`, ceLtp);
      book.mark(`${cfg.symbol} ${strike} PE`, peLtp);
      if (book.positions[0]) {
        const locked = book.positions[0];
        book.mark(locked.symbol, locked.option === "PE" ? peLtp : ceLtp);
      }
      NiftyVwapStrategy.tick({
        algo,
        config: cfg,
        now,
        feedLive: true,
        sessionOpen: true,
        minutesToClose: i >= session.length - 1 ? 0 : 60,
        futuresBars: slice,
        ceBars: [...ceBars],
        peBars: [...peBars],
        spot,
        step: 50,
        expiry: sessionKeyIST(bar.time),
        ceLtp,
        peLtp,
        ceVwap: sessionVwap(ceBars),
        peVwap: sessionVwap(peBars),
        positions: book.positions,
        adapter,
      });
    }
    if (book.positions[0]) book.exit(book.positions[0]);
  }

  const trades = book.closed;
  const wins = trades.filter((row) => row.pnl > 0).length;
  const pnl = trades.reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  return {
    ranAt: new Date().toISOString(),
    timeframe: "5m",
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
      reason: row.option,
    })),
  };
}

export const BacktestAdapter = { run: runNiftyVwapBacktest };
