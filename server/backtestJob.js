import { Worker } from "node:worker_threads";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function backtestBusyFile() {
  return process.env.T2S_BACKTEST_BUSY_FILE || path.join(__dirname, "data", "backtest.busy");
}

export const BACKTEST_BUSY_MS = 300_000;

export function markBacktestBusy() {
  try {
    fs.mkdirSync(path.dirname(backtestBusyFile()), { recursive: true });
    fs.writeFileSync(backtestBusyFile(), `${Date.now()}\n`);
  } catch {
    /* health watch just retries */
  }
}

export function clearBacktestBusy() {
  try {
    fs.unlinkSync(backtestBusyFile());
  } catch {
    /* already gone */
  }
}

export function isBacktestBusy(ttlMs = BACKTEST_BUSY_MS) {
  try {
    const age = Date.now() - fs.statSync(backtestBusyFile()).mtimeMs;
    return age >= 0 && age < (Number(ttlMs) || BACKTEST_BUSY_MS);
  } catch {
    return false;
  }
}

export function runReplayInWorker({ kind, algo, candles, timeoutMs = 120_000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(new URL("./backtestWorker.js", import.meta.url)));
    let settled = false;
    const timer = setTimeout(() => {
      worker.terminate();
      finish(() => reject(new Error("Backtest timed out after 2 minutes")));
    }, Number(timeoutMs) || 120_000);
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    worker.once("message", (msg) => {
      if (!msg?.ok) {
        finish(() => reject(new Error(msg?.error || "Backtest failed")));
        return;
      }
      finish(() => resolve(msg.result));
    });
    worker.once("error", (error) => {
      finish(() => reject(error));
    });
    worker.once("exit", (code) => {
      if (settled) return;
      finish(() => reject(new Error(`Backtest worker exited ${code || 0}`)));
    });
    worker.postMessage({
      kind: kind || "indicator",
      algo: JSON.parse(JSON.stringify(algo || {})),
      candles,
    });
  });
}

export function extendRequestTimeout(req, ms = 180_000) {
  const wait = Number(ms) || 180_000;
  try {
    req.setTimeout(wait);
  } catch {
    /* older sockets */
  }
  try {
    req.socket?.setTimeout(wait);
  } catch {
    /* no socket */
  }
  try {
    req.res?.setTimeout(wait);
  } catch {
    /* response not attached yet */
  }
}
