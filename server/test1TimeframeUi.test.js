import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TEST1 uses the same one timeframe chip bar as every strategy", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const page = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  assert.match(builder, /data-test1-timeframe=\{test1 \? "true"/);
  assert.match(builder, /FirstCandleTimeframeBar/);
  assert.equal((builder.match(/<FirstCandleTimeframeBar/g) || []).length, 1);
  assert.doesNotMatch(builder, /data-test1-timeframe=\{test1 \? "true" : undefined\}\s+onChange=/);
  assert.match(page, /showsStrategyTimeframe\(algo\) \? <CardTimeframe/);
  const test1Save = builder.split(": test1")[1]?.split(": crudeFirst")[0] || "";
  assert.match(test1Save, /timeframe: \["1m", "2m", "5m", "10m", "15m"\]\.includes/);
  assert.equal(test1Save.includes('timeframe: "5m"'), false);
});
