import { parentPort } from "node:worker_threads";
import { runBacktest } from "./backtest.js";
import { runNiftyVwapBacktest } from "./niftyVwap/BacktestAdapter.js";
import { runNiftyVwapHedgeBacktest } from "./niftyVwapHedge/BacktestAdapter.js";

parentPort.on("message", (msg) => {
  try {
    const algo = msg?.algo || {};
    const candles = Array.isArray(msg?.candles) ? msg.candles : [];
    let result;
    if (msg?.kind === "hedge") result = runNiftyVwapHedgeBacktest(algo, candles);
    else if (msg?.kind === "vwap") result = runNiftyVwapBacktest(algo, candles);
    else result = runBacktest(algo, candles);
    parentPort.postMessage({ ok: true, result });
  } catch (error) {
    parentPort.postMessage({ ok: false, error: error?.message || "Backtest failed" });
  }
});
