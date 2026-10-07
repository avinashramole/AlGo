import { buildSyntheticChain, isWeeklyOptionExpiry } from "../optionChain.js";
import { optionLtpAt } from "../niftyOptionHistory.js";
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

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function storedPremium(time, strike, option) {
  if (!(Number(time) > 0) || !(Number(strike) > 0)) return null;
  const px = optionLtpAt({ symbol: "NIFTY", time: Number(time), strike: Number(strike), side: option });
  return Number(px) > 0 ? Number(px) : null;
}

/** NSE NIFTY option lot on a session day (one lot per combo). */
export function niftyLotOn(ymd = "") {
  const day = String(ymd || "").slice(0, 10);
  if (day >= "2024-10-31") return 65;
  if (day >= "2024-07-25") return 25;
  if (day >= "2021-10-29") return 50;
  if (day >= "2015-01-01") return 75;
  return 50;
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

function fallbackLegs(config) {
  const sell = Number(config.sellPremium) || 80;
  const hedge = Number(config.hedgePremium) || 20;
  return [
    { key: "sellCe", side: "SELL", option: "CE", strike: 0, premium: sell },
    { key: "sellPe", side: "SELL", option: "PE", strike: 0, premium: sell },
    { key: "buyCe", side: "BUY", option: "CE", strike: 0, premium: hedge },
    { key: "buyPe", side: "BUY", option: "PE", strike: 0, premium: hedge },
  ];
}

export function replayTest2Day(session, config) {
  const lots = Math.max(1, Math.round(Number(config.lots) || 1));
  const qty = lots * niftyLotOn(session.day);
  const rows = buildSyntheticChain(session.open, 50, 16);
  const picked = pickCombo({
    monthlyRows: rows,
    weeklyRows: rows,
    sellPremium: config.sellPremium,
    hedgePremium: config.hedgePremium,
  });
  const template = picked?.legs?.length === 4 ? picked.legs : fallbackLegs(config);
  const entryTime = Number(session.bars?.[0]?.time || 0);
  const exitTime = Number(session.bars?.[session.bars.length - 1]?.time || 0);
  const move = (session.close - session.open) / session.open;
  let usedStored = 0;
  const legs = template.map((leg) => {
    const synthEntry = Number(leg.premium);
    const fromTape = storedPremium(entryTime, leg.strike, leg.option);
    const entry = fromTape ?? synthEntry;
    if (fromTape != null) usedStored += 1;
    const tapedExit = storedPremium(exitTime, leg.strike, leg.option);
    let exit;
    if (tapedExit != null) {
      exit = tapedExit;
      usedStored += 1;
    } else if (leg.side === "BUY") {
      exit = hedgeStopMark(session, leg.option, entry, config.hedgeSlPct);
    } else {
      exit = markPremium(entry, move, leg.option, "sell");
    }
    const pnl =
      leg.side === "SELL" ? round2((entry - exit) * qty) : round2((exit - entry) * qty);
    return {
      key: leg.key,
      side: leg.side,
      option: leg.option,
      strike: Number(leg.strike) || 0,
      entry,
      exit,
      qty,
      pnl,
    };
  });
  const pnl = round2(legs.reduce((sum, row) => sum + row.pnl, 0));
  return { day: session.day, pnl, legs, qty, usedStored };
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

function comboStats(pnls, equity, maxDrawdown) {
  const n = pnls.length;
  const winPnls = pnls.filter((value) => value > 0);
  const lossPnls = pnls.filter((value) => value < 0);
  const avgProfit = n ? equity / n : 0;
  const avgWin = winPnls.length ? winPnls.reduce((sum, value) => sum + value, 0) / winPnls.length : 0;
  const avgLoss = lossPnls.length ? lossPnls.reduce((sum, value) => sum + value, 0) / lossPnls.length : 0;
  const maxProfit = n ? Math.max(...pnls) : 0;
  const maxLoss = n ? Math.min(...pnls) : 0;
  const rewardRisk = avgLoss ? Math.abs(avgWin / avgLoss) : 0;
  const returnDd = maxDrawdown < 0 ? equity / Math.abs(maxDrawdown) : 0;
  let winStreak = 0;
  let loseStreak = 0;
  let maxWinStreak = 0;
  let maxLoseStreak = 0;
  for (const value of pnls) {
    if (value > 0) {
      winStreak += 1;
      loseStreak = 0;
      maxWinStreak = Math.max(maxWinStreak, winStreak);
    } else if (value < 0) {
      loseStreak += 1;
      winStreak = 0;
      maxLoseStreak = Math.max(maxLoseStreak, loseStreak);
    } else {
      winStreak = 0;
      loseStreak = 0;
    }
  }
  return {
    avgProfit: round2(avgProfit),
    avgWin: round2(avgWin),
    avgLoss: round2(avgLoss),
    maxProfit: round2(maxProfit),
    maxLoss: round2(maxLoss),
    maxWinStreak,
    maxLoseStreak,
    expectancy: round2(avgProfit),
    rewardRisk: Number(rewardRisk.toFixed(2)),
    returnDd: Number(returnDd.toFixed(2)),
  };
}

export function runTest2Backtest(algo, candles = []) {
  const config = niftyTest2Config(algo);
  const sessions = sessionDays(candles, config.startTimeIst, config.endTimeIst);
  const trades = [];
  const legsBook = [];
  const pnls = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDdFrom = "";
  let maxDdTo = "";
  let inDrawdown = false;
  let ddStart = "";
  let ddTrades = 0;
  let maxTradesInDd = 0;
  let storedMarks = 0;
  let totalMarks = 0;
  const overnight = config.holdStyle === "btst";
  const last = overnight ? sessions.length - 1 : sessions.length;
  for (let i = 0; i < last; i += 1) {
    const session = overnight ? holdOvernight(sessions[i], sessions[i + 1]) : sessions[i];
    if (!session) continue;
    const combo = replayTest2Day(session, config);
    if (!combo) continue;
    storedMarks += Number(combo.usedStored) || 0;
    totalMarks += combo.legs.length * 2;
    const netCredit = round2(combo.legs.reduce((sum, leg) => sum + (leg.side === "SELL" ? leg.entry : -leg.entry), 0));
    const netExit = round2(combo.legs.reduce((sum, leg) => sum + (leg.side === "SELL" ? leg.exit : -leg.exit), 0));
    trades.push({
      side: "COMBO",
      symbol: "NIFTY 4-leg",
      entry: netCredit,
      exit: netExit,
      qty: combo.qty,
      pnl: combo.pnl,
      bars: overnight ? 2 : 1,
      day: combo.day,
    });
    for (const leg of combo.legs) {
      legsBook.push({
        side: `${leg.side} ${leg.option}`,
        symbol: leg.strike ? `NIFTY ${leg.strike} ${leg.option}` : `${leg.side} ${leg.option}`,
        entry: leg.entry,
        exit: leg.exit,
        qty: leg.qty,
        pnl: leg.pnl,
        bars: overnight ? 2 : 1,
        day: combo.day,
      });
    }
    pnls.push(combo.pnl);
    equity += combo.pnl;
    if (equity >= peak) {
      peak = equity;
      if (inDrawdown) maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
      inDrawdown = false;
      ddTrades = 0;
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        ddStart = combo.day;
        ddTrades = 1;
      } else {
        ddTrades += 1;
      }
      const draw = equity - peak;
      if (draw <= maxDrawdown) {
        maxDrawdown = draw;
        maxDdFrom = ddStart;
        maxDdTo = combo.day;
        maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
      }
    }
  }
  if (inDrawdown) maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
  const wins = pnls.filter((value) => value > 0).length;
  const stats = comboStats(pnls, equity, maxDrawdown);
  const optionSource = !storedMarks ? "synth" : storedMarks >= totalMarks ? "stored" : "mixed";
  return {
    trades: trades.length,
    combos: trades.length,
    comboWins: wins,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    comboWinRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    pnl: round2(equity),
    maxDrawdown: round2(maxDrawdown),
    maxDdFrom,
    maxDdTo,
    maxTradesInDd,
    legs: legsBook.length,
    optionSource,
    holdStyle: config.holdStyle,
    lotNote: "historical NIFTY lot 75→50→25→65",
    tradesBook: trades,
    legsBook,
    book: trades.slice(-80),
    ...stats,
  };
}

export const Test2Engine = {
  niftyLotOn,
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
