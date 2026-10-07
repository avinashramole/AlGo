import { isWeeklyOptionExpiry } from "../optionChain.js";
import { hmToMinutes, istWallTime } from "../niftyVwap/VwapSignalEngine.js";
import { niftyTest2Config } from "../niftyVwap/config.js";

function ltpOf(row, option) {
  return option === "PE" ? Number(row?.putLtp) : Number(row?.callLtp);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function dayKey(time) {
  const wall = istWallTime(time);
  return `${wall.year}-${pad2(wall.month)}-${pad2(wall.day)}`;
}

function minutesOf(time) {
  const wall = istWallTime(time);
  return wall.hour * 60 + wall.minute;
}

export function strikeByMinPremium(rows = [], option = "CE", minPremium = 80) {
  const floor = Math.max(0.05, Number(minPremium) || 0);
  const listed = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.strike) > 0 && ltpOf(row, option) > 0);
  if (!listed.length) return null;
  const qualified = listed.filter((row) => ltpOf(row, option) >= floor);
  const pool = qualified.length ? qualified : listed;
  pool.sort((a, b) => {
    const aGap = Math.abs(ltpOf(a, option) - floor);
    const bGap = Math.abs(ltpOf(b, option) - floor);
    if (qualified.length) {
      const byPrem = ltpOf(a, option) - ltpOf(b, option);
      if (byPrem) return byPrem;
    }
    return aGap - bGap || Number(a.strike) - Number(b.strike);
  });
  const row = pool[0];
  return {
    strike: Number(row.strike),
    premium: ltpOf(row, option),
    option,
  };
}

export function monthlyExpiry(dates = [], symbol = "NIFTY") {
  const list = (Array.isArray(dates) ? dates : []).filter(Boolean);
  const monthly = list.filter((date) => !isWeeklyOptionExpiry(date, symbol));
  return monthly[0] || list[list.length - 1] || "";
}

export function weeklyExpiry(dates = [], symbol = "NIFTY") {
  const list = (Array.isArray(dates) ? dates : []).filter(Boolean);
  const weekly = list.filter((date) => isWeeklyOptionExpiry(date, symbol));
  return weekly[0] || list[0] || "";
}

export function pickCombo({ monthlyRows = [], weeklyRows = [], sellPremium = 80, hedgePremium = 20 } = {}) {
  const sellCe = strikeByMinPremium(monthlyRows, "CE", sellPremium);
  const sellPe = strikeByMinPremium(monthlyRows, "PE", sellPremium);
  const buyCe = strikeByMinPremium(weeklyRows, "CE", hedgePremium);
  const buyPe = strikeByMinPremium(weeklyRows, "PE", hedgePremium);
  if (!sellCe || !sellPe || !buyCe || !buyPe) return null;
  return {
    legs: [
      { key: "sellCe", side: "SELL", option: "CE", expiryKind: "monthly", ...sellCe },
      { key: "sellPe", side: "SELL", option: "PE", expiryKind: "monthly", ...sellPe },
      { key: "buyCe", side: "BUY", option: "CE", expiryKind: "weekly", ...buyCe },
      { key: "buyPe", side: "BUY", option: "PE", expiryKind: "weekly", ...buyPe },
    ],
  };
}

export function inEntryWindow(now, startTimeIst = "09:35", endTimeIst = "15:15") {
  const minutes = minutesOf(now);
  return minutes >= hmToMinutes(startTimeIst) && minutes < hmToMinutes(endTimeIst);
}

export function markPremium(entryPrem, movePct, side, kind = "sell") {
  const prem = Math.max(0.5, Number(entryPrem) || 0);
  const move = Number(movePct) || 0;
  const dir = side === "PE" ? -1 : 1;
  const elastic = kind === "hedge" ? 7 : 5.5;
  const theta = kind === "hedge" ? 0.18 : 0.07;
  return Number(Math.max(0.5, prem * (1 - theta) * Math.max(0.05, 1 + dir * move * elastic)).toFixed(2));
}

export function sessionDays(bars = [], startTimeIst = "09:35", endTimeIst = "15:15") {
  const start = hmToMinutes(startTimeIst);
  const end = hmToMinutes(endTimeIst);
  const groups = new Map();
  for (const bar of Array.isArray(bars) ? bars : []) {
    const time = Number(bar?.time);
    const close = Number(bar?.close);
    if (!(time > 0) || !(close > 0)) continue;
    const day = dayKey(time);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(bar);
  }
  const sessions = [];
  for (const [day, rows] of groups) {
    rows.sort((a, b) => Number(a.time) - Number(b.time));
    const inWindow = rows.filter((row) => {
      const minutes = minutesOf(row.time);
      return minutes >= start && minutes <= end;
    });
    const used = inWindow.length ? inWindow : rows;
    const open = Number(used[0].open || used[0].close);
    const last = used[used.length - 1];
    const close = Number(last.close || last.open);
    const high = Math.max(...used.map((row) => Number(row.high || row.close || 0)));
    const low = Math.min(...used.map((row) => Number(row.low || row.close || open)));
    if (!(open > 0) || !(close > 0)) continue;
    sessions.push({ day, open, close, high, low, bars: used });
  }
  return sessions;
}

function hedgeStopMark(session, side, entryPrem, slPct) {
  const sl = Number((entryPrem * (1 - slPct / 100)).toFixed(2));
  const entry = session.open;
  for (const bar of session.bars) {
    const spot = side === "CE" ? Number(bar.low || bar.close) : Number(bar.high || bar.close);
    if (!(spot > 0)) continue;
    const mark = markPremium(entryPrem, (spot - entry) / entry, side, "hedge");
    if (mark <= sl) return sl;
  }
  const eodMove = (session.close - entry) / entry;
  const eod = markPremium(entryPrem, eodMove, side, "hedge");
  return eod <= sl ? sl : eod;
}

export function replayTest2Day(session, config) {
  const qty = config.qty;
  const sell = config.sellPremium;
  const hedge = config.hedgePremium;
  const move = (session.close - session.open) / session.open;
  const sellCeExit = markPremium(sell, move, "CE", "sell");
  const sellPeExit = markPremium(sell, move, "PE", "sell");
  const buyCeExit = hedgeStopMark(session, "CE", hedge, config.hedgeSlPct);
  const buyPeExit = hedgeStopMark(session, "PE", hedge, config.hedgeSlPct);
  const legs = [
    { side: "SELL", option: "CE", entry: sell, exit: sellCeExit, qty, pnl: Number(((sell - sellCeExit) * qty).toFixed(2)) },
    { side: "SELL", option: "PE", entry: sell, exit: sellPeExit, qty, pnl: Number(((sell - sellPeExit) * qty).toFixed(2)) },
    { side: "BUY", option: "CE", entry: hedge, exit: buyCeExit, qty, pnl: Number(((buyCeExit - hedge) * qty).toFixed(2)) },
    { side: "BUY", option: "PE", entry: hedge, exit: buyPeExit, qty, pnl: Number(((buyPeExit - hedge) * qty).toFixed(2)) },
  ];
  const pnl = Number(legs.reduce((sum, row) => sum + row.pnl, 0).toFixed(2));
  return { day: session.day, pnl, legs };
}

function holdOvernight(entry, exit) {
  if (!entry || !exit) return null;
  const sellBars = (exit.bars || []).slice(0, 1);
  const sell = sellBars[0];
  const sellHigh = Number(sell?.high || exit.open || exit.close);
  const sellLow = Number(sell?.low || exit.open || exit.close);
  return {
    day: entry.day,
    open: entry.open,
    close: exit.open || exit.close,
    high: Math.max(entry.high, sellHigh),
    low: Math.min(entry.low, sellLow),
    bars: [...(entry.bars || []), ...sellBars],
  };
}

export function runTest2Backtest(algo, candles = []) {
  const config = niftyTest2Config(algo);
  const sessions = sessionDays(candles, config.startTimeIst, config.endTimeIst);
  const trades = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let comboWins = 0;
  let combos = 0;
  const overnight = config.holdStyle === "btst";
  const last = overnight ? sessions.length - 1 : sessions.length;
  for (let i = 0; i < last; i += 1) {
    const session = overnight ? holdOvernight(sessions[i], sessions[i + 1]) : sessions[i];
    if (!session) continue;
    const combo = replayTest2Day(session, config);
    combos += 1;
    if (combo.pnl > 0) comboWins += 1;
    for (const leg of combo.legs) {
      trades.push({
        side: `${leg.side} ${leg.option}`,
        entry: leg.entry,
        exit: leg.exit,
        qty: leg.qty,
        pnl: leg.pnl,
        bars: overnight ? 2 : 1,
        day: combo.day,
      });
    }
    equity += combo.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  const wins = trades.filter((row) => row.pnl > 0).length;
  return {
    trades: trades.length,
    combos,
    comboWins,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    comboWinRate: combos ? Number(((comboWins / combos) * 100).toFixed(1)) : 0,
    pnl: Number(equity.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    optionSource: "synth",
    holdStyle: config.holdStyle,
    tradesBook: trades,
    book: trades.slice(-80),
  };
}

export const Test2Engine = {
  strikeByMinPremium,
  pickCombo,
  monthlyExpiry,
  weeklyExpiry,
  inEntryWindow,
  markPremium,
  sessionDays,
  replayTest2Day,
  runTest2Backtest,
};
