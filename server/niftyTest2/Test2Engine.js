import { isWeeklyOptionExpiry } from "../optionChain.js";
import { hmToMinutes, istWallTime } from "../niftyVwap/VwapSignalEngine.js";
import { niftyTest2Config } from "../niftyVwap/config.js";

function ltpOf(row, option) {
  return option === "PE" ? Number(row?.putLtp) : Number(row?.callLtp);
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
  const wall = istWallTime(now);
  const minutes = wall.hour * 60 + wall.minute;
  return minutes >= hmToMinutes(startTimeIst) && minutes < hmToMinutes(endTimeIst);
}

export function runTest2Backtest(algo, candles = []) {
  const config = niftyTest2Config(algo);
  const qty = config.qty;
  const bars = (Array.isArray(candles) ? candles : []).filter((row) => Number(row?.close) > 0 && Number(row?.time) > 0);
  const trades = [];
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const seen = new Set();
  for (const bar of bars) {
    const wall = istWallTime(bar.time);
    const minutes = wall.hour * 60 + wall.minute;
    const day = `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
    if (seen.has(day) || minutes < hmToMinutes(config.startTimeIst)) continue;
    seen.add(day);
    const open = Number(bar.open || bar.close);
    const close = Number(bar.close);
    const high = Number(bar.high || close);
    const low = Number(bar.low || close);
    if (!(open > 0) || !(close > 0)) continue;
    const sellCredit = config.sellPremium * 2;
    const hedgeDebit = config.hedgePremium * 2;
    const move = (close - open) / open;
    const sellCeExit = Math.max(0.5, config.sellPremium * (1 - move * 8));
    const sellPeExit = Math.max(0.5, config.sellPremium * (1 + move * 8));
    const hedgeHit = high / open - 1 > 0.004 || 1 - low / open > 0.004;
    const buyCeExit = hedgeHit && move > 0 ? config.hedgePremium * (1 - config.hedgeSlPct / 100) : Math.max(0.5, config.hedgePremium * (1 + move * 6));
    const buyPeExit = hedgeHit && move < 0 ? config.hedgePremium * (1 - config.hedgeSlPct / 100) : Math.max(0.5, config.hedgePremium * (1 - move * 6));
    const pnl = Number(
      (
        (config.sellPremium - sellCeExit) * qty +
        (config.sellPremium - sellPeExit) * qty +
        (buyCeExit - config.hedgePremium) * qty +
        (buyPeExit - config.hedgePremium) * qty
      ).toFixed(2),
    );
    trades.push({
      side: "BOTH",
      entry: Number((sellCredit - hedgeDebit).toFixed(2)),
      exit: Number((sellCeExit + sellPeExit - buyCeExit - buyPeExit).toFixed(2)),
      qty,
      pnl,
      bars: 1,
    });
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  const wins = trades.filter((row) => row.pnl > 0).length;
  return {
    trades: trades.length,
    wins,
    losses: trades.length - wins,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    pnl: Number(equity.toFixed(2)),
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    book: trades.slice(-80),
  };
}

export const Test2Engine = {
  strikeByMinPremium,
  pickCombo,
  monthlyExpiry,
  weeklyExpiry,
  inEntryWindow,
  runTest2Backtest,
};
