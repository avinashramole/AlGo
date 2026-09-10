import { atmStrike } from "../niftyVwap/OptionStrikeSelector.js";
import { aggregateSessionBars, lastBarVwapReversal, sessionBars } from "../niftyVwap/VwapSignalEngine.js";

export function formatHedgeLevels(reversal = {}) {
  const open = Number(reversal.open || 0);
  const close = Number(reversal.close || 0);
  const vwap = Number(reversal.vwap || 0);
  if (!(open > 0) || !(close > 0) || !(vwap > 0)) return "";
  return `O ${open.toFixed(2)} C ${close.toFixed(2)} VWAP ${vwap.toFixed(2)}`;
}

export function hedgeReversalFromBars(futuresBars = [], now = Date.now()) {
  const futCompleted = aggregateSessionBars(sessionBars(futuresBars || [], now), 15, now);
  const reversal = lastBarVwapReversal(futCompleted);
  return { futCompleted, reversal, bar: reversal.bar || futCompleted[futCompleted.length - 1] || null };
}

export function hedgePreviewTrade({ reversal, primarySide = "", primaryStrike = 0, step = 50 } = {}) {
  const close = Number(reversal?.close || 0);
  const fromClose = atmStrike(close, step);
  const lockedStrike = Number(primaryStrike) > 0 ? Number(primaryStrike) : 0;
  const levels = formatHedgeLevels(reversal);
  const waitRule = "CE needs O<VWAP C>VWAP · PE needs O>VWAP C<VWAP";

  if (primarySide === "PE" || primarySide === "CE") {
    const strike = lockedStrike || fromClose;
    return {
      option: primarySide,
      strike,
      reason: levels ? `OPEN ${primarySide} ${strike} · 15m ${levels}` : `OPEN ${primarySide}${strike ? ` ${strike}` : ""}`,
      label: strike ? `NIFTY ${strike} ${primarySide}` : `NIFTY ${primarySide}`,
    };
  }

  if (reversal?.buyCe) {
    const strike = fromClose;
    return {
      option: "CE",
      strike,
      reason: `15m ${levels} · O<VWAP C>VWAP → BUY CE ${strike}`,
      label: strike ? `NIFTY ${strike} CE` : "NIFTY CE",
    };
  }

  if (reversal?.buyPe) {
    const strike = fromClose;
    return {
      option: "PE",
      strike,
      reason: `15m ${levels} · O>VWAP C<VWAP → BUY PE ${strike}`,
      label: strike ? `NIFTY ${strike} PE` : "NIFTY PE",
    };
  }

  return {
    option: "",
    strike: fromClose,
    reason: levels ? `WAIT 15m ${levels} · ${waitRule}` : `WAIT 15m · ${waitRule}`,
    label: fromClose ? `NIFTY ${fromClose} weekly ATM CE/PE` : "NIFTY weekly ATM CE/PE",
  };
}
