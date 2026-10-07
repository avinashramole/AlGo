import { buildSyntheticChain, isWeeklyOptionExpiry } from "../optionChain.js";
import { optionLtpAt } from "../niftyOptionHistory.js";
import { preloadRollingDays, rollingChainAt, rollingPath, rollingPremiumAt } from "../dhanRollingOption.js";
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

function rollingKind(leg) {
  return leg.expiryKind === "monthly" ? "monthly" : "weekly";
}

function storedEntryChain(session) {
  const time = Number(session.bars?.[0]?.time || 0);
  const weekly = rollingChainAt({ symbol: "NIFTY", ymd: session.day, time, kind: "weekly" });
  const monthly = rollingChainAt({ symbol: "NIFTY", ymd: session.day, time, kind: "monthly" });
  if (weekly?.length && monthly?.length) return { weekly, monthly, source: "stored" };
  if (weekly?.length || monthly?.length) return { incomplete: true };
  return null;
}

function rollingExitForLeg(leg, entry, config, session, exitSession) {
  const kind = rollingKind(leg);
  const path = [
    ...rollingPath({ symbol: "NIFTY", ymd: session.day, strike: leg.strike, option: leg.option, kind }),
    ...(exitSession && exitSession.day !== session.day
      ? rollingPath({ symbol: "NIFTY", ymd: exitSession.day, strike: leg.strike, option: leg.option, kind })
      : []),
  ];
  if (leg.side === "BUY") {
    const sl = Number((entry * (1 - config.hedgeSlPct / 100)).toFixed(2));
    for (const bar of path) {
      if (bar.low <= sl) return sl;
    }
  }
  const exitTime = Number((exitSession || session).bars?.[0]?.time || session.bars?.[session.bars.length - 1]?.time || 0);
  const exitYmd = (exitSession || session).day;
  const mark =
    rollingPremiumAt({ symbol: "NIFTY", ymd: exitYmd, time: exitTime, strike: leg.strike, option: leg.option, kind }) ??
    path[path.length - 1]?.close ??
    null;
  return mark;
}

export function replayTest2Day(session, config, exitSession = null) {
  const lots = Math.max(1, Math.round(Number(config.lots) || 1));
  const qty = lots * niftyLotOn(session.day);
  const cost = Math.max(0, Number(config.costPerCombo) || 0);
  const rolling = storedEntryChain(session);
  if (rolling?.incomplete) return { day: session.day, skip: true, reason: "incomplete-chain", source: "stored" };
  const synthRows = buildSyntheticChain(session.open, 50, 16);
  const picked = pickCombo({
    monthlyRows: rolling?.monthly || synthRows,
    weeklyRows: rolling?.weekly || synthRows,
    sellPremium: config.sellPremium,
    hedgePremium: config.hedgePremium,
  });
  if (rolling && !picked) return { day: session.day, skip: true, reason: "no-combo", source: "stored" };
  const template = picked?.legs?.length === 4 ? picked.legs : fallbackLegs(config);
  const entryTime = Number(session.bars?.[0]?.time || 0);
  const exitTime = Number((exitSession || session).bars?.[(exitSession ? 0 : (session.bars?.length || 1) - 1)]?.time || 0);
  const move = ((exitSession || session).close - session.open) / session.open;
  let usedStored = 0;
  const legs = [];
  for (const leg of template) {
    const synthEntry = Number(leg.premium);
    const fromTape =
      rolling
        ? Number(leg.premium)
        : storedPremium(entryTime, leg.strike, leg.option);
    const entry = fromTape ?? synthEntry;
    if (fromTape != null) usedStored += 1;
    let exit = null;
    if (rolling) {
      exit = rollingExitForLeg(leg, entry, config, session, exitSession);
      if (!(exit > 0)) return { day: session.day, skip: true, reason: "no-exit", source: "stored" };
      usedStored += 1;
    } else {
      const tapedExit = storedPremium(exitTime, leg.strike, leg.option);
      if (tapedExit != null) {
        exit = tapedExit;
        usedStored += 1;
      } else if (leg.side === "BUY") {
        exit = hedgeStopMark(session, leg.option, entry, config.hedgeSlPct);
      } else {
        exit = markPremium(entry, move, leg.option, "sell");
      }
    }
    const raw = leg.side === "SELL" ? (entry - exit) * qty : (exit - entry) * qty;
    legs.push({
      key: leg.key,
      side: leg.side,
      option: leg.option,
      strike: Number(leg.strike) || 0,
      expiryKind: leg.expiryKind || "",
      entry,
      exit,
      qty,
      pnl: round2(raw),
    });
  }
  const pnl = round2(legs.reduce((sum, row) => sum + row.pnl, 0) - cost);
  return {
    day: session.day,
    exitDay: (exitSession || session).day,
    pnl,
    legs,
    qty,
    usedStored,
    cost,
    source: rolling ? "stored" : "synth",
  };
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

function markDay(row) {
  return String(row?.exitDay || row?.day || "");
}

function comboStats(trades, equity, maxDrawdown) {
  const pnls = trades.map((row) => Number(row.pnl) || 0);
  const n = pnls.length;
  const winPnls = pnls.filter((value) => value > 0);
  const lossPnls = pnls.filter((value) => value < 0);
  const avgProfit = n ? equity / n : 0;
  const avgWin = winPnls.length ? winPnls.reduce((sum, value) => sum + value, 0) / winPnls.length : 0;
  const avgLoss = lossPnls.length ? lossPnls.reduce((sum, value) => sum + value, 0) / lossPnls.length : 0;
  let best = trades[0];
  let worst = trades[0];
  for (const row of trades) {
    if (Number(row.pnl) > Number(best?.pnl ?? Number.NEGATIVE_INFINITY)) best = row;
    if (Number(row.pnl) < Number(worst?.pnl ?? Number.POSITIVE_INFINITY)) worst = row;
  }
  const maxProfit = n ? Number(best.pnl) || 0 : 0;
  const maxLoss = n ? Number(worst.pnl) || 0 : 0;
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
    maxProfitDay: n ? markDay(best) : "",
    maxLossDay: n ? markDay(worst) : "",
    maxWinStreak,
    maxLoseStreak,
    expectancy: round2(avgProfit),
    rewardRisk: Number(rewardRisk.toFixed(2)),
    returnDd: Number(returnDd.toFixed(2)),
  };
}

function pushCombo(trades, legsBook, combo, overnight) {
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
    exitDay: combo.exitDay || combo.day,
    source: combo.source,
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
      exitDay: combo.exitDay || combo.day,
    });
  }
}

function walkEquity(pnls) {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let maxDdFrom = "";
  let maxDdTo = "";
  let inDrawdown = false;
  let ddStart = "";
  let ddTrades = 0;
  let maxTradesInDd = 0;
  pnls.forEach((value, index) => {
    equity += value.pnl;
    const day = markDay(value);
    if (equity >= peak) {
      peak = equity;
      if (inDrawdown) maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
      inDrawdown = false;
      ddTrades = 0;
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        ddStart = day;
        ddTrades = 1;
      } else {
        ddTrades += 1;
      }
      const draw = equity - peak;
      if (draw <= maxDrawdown) {
        maxDrawdown = draw;
        maxDdFrom = ddStart;
        maxDdTo = day;
        maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
      }
    }
    return index;
  });
  if (inDrawdown) maxTradesInDd = Math.max(maxTradesInDd, ddTrades);
  return { equity: round2(equity), maxDrawdown: round2(maxDrawdown), maxDdFrom, maxDdTo, maxTradesInDd };
}

export function runTest2Backtest(algo, candles = []) {
  const config = niftyTest2Config(algo);
  const sessions = sessionDays(candles, config.startTimeIst, config.endTimeIst);
  preloadRollingDays(
    "NIFTY",
    sessions.map((row) => row.day),
  );
  const storedTrades = [];
  const synthTrades = [];
  const legsBook = [];
  const skipped = [];
  const overnight = config.holdStyle === "btst";
  const last = overnight ? sessions.length - 1 : sessions.length;
  for (let i = 0; i < last; i += 1) {
    const entry = sessions[i];
    const exit = overnight ? sessions[i + 1] : null;
    if (!entry) continue;
    const hold = overnight ? holdOvernight(entry, sessions[i + 1]) : entry;
    if (!hold) continue;
    const combo = replayTest2Day(hold, config, exit);
    if (!combo || combo.skip) {
      skipped.push({ day: entry.day, reason: combo?.reason || "skip" });
      continue;
    }
    if (combo.source === "stored") pushCombo(storedTrades, legsBook, combo, overnight);
    else pushCombo(synthTrades, legsBook, combo, overnight);
  }
  const primary = storedTrades.length ? storedTrades : synthTrades;
  const equityWalk = walkEquity(primary);
  const pnls = primary.map((row) => row.pnl);
  const wins = pnls.filter((value) => value > 0).length;
  const stats = comboStats(primary, equityWalk.equity, equityWalk.maxDrawdown);
  const storedWins = storedTrades.filter((row) => row.pnl > 0).length;
  const synthWins = synthTrades.filter((row) => row.pnl > 0).length;
  const optionSource = storedTrades.length
    ? synthTrades.length
      ? "mixed"
      : "stored"
    : "synth";
  return {
    trades: primary.length,
    combos: primary.length,
    comboWins: wins,
    wins,
    losses: primary.length - wins,
    winRate: primary.length ? Number(((wins / primary.length) * 100).toFixed(1)) : 0,
    comboWinRate: primary.length ? Number(((wins / primary.length) * 100).toFixed(1)) : 0,
    pnl: equityWalk.equity,
    maxDrawdown: equityWalk.maxDrawdown,
    maxDdFrom: equityWalk.maxDdFrom,
    maxDdTo: equityWalk.maxDdTo,
    maxTradesInDd: equityWalk.maxTradesInDd,
    legs: legsBook.length,
    optionSource,
    holdStyle: config.holdStyle,
    lotNote: "historical NIFTY lot 75→50→25→65",
    costPerCombo: config.costPerCombo,
    storedTrades: storedTrades.length,
    storedWins,
    storedWinRate: storedTrades.length ? Number(((storedWins / storedTrades.length) * 100).toFixed(1)) : 0,
    storedPnl: round2(storedTrades.reduce((sum, row) => sum + row.pnl, 0)),
    synthTrades: synthTrades.length,
    synthWins,
    synthWinRate: synthTrades.length ? Number(((synthWins / synthTrades.length) * 100).toFixed(1)) : 0,
    skippedDays: skipped.length,
    skipped,
    tradesBook: primary,
    legsBook,
    book: primary.slice(-80),
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
