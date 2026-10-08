import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TEST2 edit form keeps the script dropdown that TEST1 already shows", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const algo = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  assert.match(builder, /Script · NIFTY BANKNIFTY SENSEX/);
  assert.match(builder, /BANKNIFTY · CE\/PE/);
  assert.match(builder, /mark="name-slot"/);
  assert.match(builder, /data-ui=\{test2 \? "test2-script-v3"/);
  assert.match(algo, /Script · NIFTY BANKNIFTY SENSEX/);
  assert.match(algo, /data-test2-scripts="card"/);
  assert.match(algo, /fills newest missing weekdays first/);
  assert.match(algo, /Start with this month/);
});

test("backtest range tells TEST2 to fill this month first", () => {
  const range = fs.readFileSync(path.join(root, "src/components/dashboard/BacktestRange.tsx"), "utf8");
  assert.match(range, /fastest Dhan rolling fill/);
  assert.match(range, /1 \/ 3 \/ 6 months/);
});
