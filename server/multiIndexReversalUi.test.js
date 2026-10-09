import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Multi-Index Reversal settings expose four indices and locked defaults", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const lib = fs.readFileSync(path.join(root, "src/lib/strategies.ts"), "utf8");
  const algoPage = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const deploy = fs.readFileSync(path.join(root, "deploy/update-website.sh"), "utf8");
  assert.match(builder, /data-mir-strategy=\{mir \? "true"/);
  assert.match(builder, /data-mir-index/);
  assert.match(builder, /data-mir-exchange/);
  assert.match(builder, /data-mir-offset/);
  assert.match(builder, /data-mir-basis/);
  assert.match(builder, /data-mir-timeframe=\{mir \? "true"/);
  assert.match(builder, /MULTI_INDEX_SCRIPTS/);
  assert.match(builder, /MULTI_INDEX_TIMEFRAMES/);
  assert.match(builder, /kind: "multi-index-reversal"/);
  assert.match(builder, /runMode: "paper"/);
  assert.match(builder, /MULTI_INDEX_SCRIPTS\.map/);
  assert.equal((builder.match(/data-mir-index/g) || []).length, 1);
  assert.match(lib, /MULTI_INDEX_REVERSAL_NAME = "Multi-Index Reversal Strategy"/);
  assert.match(lib, /id: "NIFTY", label: "NIFTY 50"/);
  assert.match(lib, /id: "SENSEX", label: "SENSEX", exchange: "BSE"/);
  assert.match(lib, /MULTI_INDEX_TIMEFRAMES = \["5m", "10m", "15m", "30m", "1H"\]/);
  assert.match(lib, /runMode: "paper"/);
  assert.match(algoPage, /data-mir-strategy=\{isMultiIndexReversalKind\(algo\) \? "true"/);
  assert.match(algoPage, /data-mir-monitor="true"/);
  assert.match(deploy, /data-mir-strategy/);
});
