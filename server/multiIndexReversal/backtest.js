import { defaultMultiIndexReversalAlgo, multiIndexReversalConfig } from "./config.js";
import { MultiIndexReversalStrategy } from "./MultiIndexReversalStrategy.js";

function synthOption(prev, indexBar, follow) {
  const open = Math.max(1, Number(prev) || 100);
  const delta = (Number(indexBar.close) - Number(indexBar.open)) * 0.45;
  const close = Math.max(1, follow ? open + delta : open - delta);
  return {
    time: Number(indexBar.time),
    open,
    close,
    high: Math.max(open, close),
    low: Math.min(open, close),
    volume: 1,
  };
}

function paperBook() {
  const positions = [];
  const closed = [];
  const adapter = {
    mode: "paper",
    place(payload) {
      const price = Number(payload.price);
      if (!(price > 0)) return { error: "No fill price" };
      const pos = {
        id: `bt-${payload.option}-${payload.barTime || Date.now()}`,
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
    cancelTarget() {
      return { ok: true };
    },
  };
  return { positions, closed, adapter };
}

export function runMultiIndexReversalBacktest(algo, candles = []) {
  const config = multiIndexReversalConfig(algo);
  const barMs = (config.barMinutes || 15) * 60 * 1000;
  const replay = defaultMultiIndexReversalAlgo({
    ...algo,
    runMode: "paper",
    enabled: true,
    mirState: undefined,
  });
  const env = paperBook();
  const indexBars = [];
  const ceBars = [];
  const peBars = [];
  let cePx = 100;
  let pePx = 100;
  const step = config.symbol === "SENSEX" ? 100 : config.symbol === "BANKNIFTY" ? 100 : 50;
  for (const raw of candles) {
    const bar = {
      time: Number(raw.time),
      open: Number(raw.open),
      close: Number(raw.close),
      high: Number(raw.high || Math.max(raw.open, raw.close)),
      low: Number(raw.low || Math.min(raw.open, raw.close)),
      volume: Number(raw.volume || 1),
    };
    if (!(bar.time > 0) || !(bar.open > 0) || !(bar.close > 0)) continue;
    const ceBar = synthOption(cePx, bar, true);
    const peBar = synthOption(pePx, bar, false);
    cePx = ceBar.close;
    pePx = peBar.close;
    indexBars.push(bar);
    ceBars.push(ceBar);
    peBars.push(peBar);
    for (const pos of env.positions) {
      pos.ltp = pos.option === "PE" ? pePx : cePx;
      pos.pnl = (pos.ltp - pos.avg) * pos.qty;
    }
    MultiIndexReversalStrategy.tick({
      algo: replay,
      config,
      now: bar.time + barMs + 1000,
      feedLive: true,
      indexBars,
      ceBars,
      peBars,
      spot: bar.close,
      step,
      expiry: "BACKTEST",
      ceLtp: cePx,
      peLtp: pePx,
      positions: env.positions,
      orders: [],
      adapter: env.adapter,
    });
  }
  if (env.positions.length) {
    MultiIndexReversalStrategy.emergencyExit({
      algo: replay,
      config,
      now: Number(candles.at(-1)?.time || Date.now()) + barMs + 1000,
      positions: env.positions,
      orders: [],
      adapter: env.adapter,
      reason: "backtest-end",
    });
  }
  const book = env.closed.map((row) => ({
    time: row.expiry,
    symbol: row.symbol,
    side: "BUY",
    qty: row.qty,
    entry: row.avg,
    exit: row.exit,
    pnl: row.pnl,
  }));
  const pnl = Number(book.reduce((sum, row) => sum + Number(row.pnl || 0), 0).toFixed(2));
  const wins = book.filter((row) => Number(row.pnl) > 0).length;
  return {
    pnl,
    trades: book.length,
    winRate: book.length ? Number(((wins / book.length) * 100).toFixed(1)) : 0,
    book,
    timeframe: config.timeframe,
    source: "paper-replay",
    optionSource: "synth",
  };
}
