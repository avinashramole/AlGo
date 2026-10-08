import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TEST2 edit form shows the script dropdown once", () => {
  const builder = fs.readFileSync(path.join(root, "src/components/dashboard/StrategyBuilder.tsx"), "utf8");
  const algo = fs.readFileSync(path.join(root, "src/pages/Algo.tsx"), "utf8");
  const selects = builder.match(/<Test2ScriptSelect /g) || [];
  assert.equal(selects.length, 1);
  assert.match(builder, /Script · NIFTY BANKNIFTY SENSEX/);
  assert.match(builder, /BANKNIFTY · CE\/PE/);
  assert.match(builder, /mark="top"/);
  assert.equal(builder.includes('mark="premiums"'), false);
  assert.equal(builder.includes('mark="name-slot"'), false);
  assert.match(builder, /data-ui=\{test2 \? "test2-script-v4"/);
  assert.match(algo, /Script · NIFTY BANKNIFTY SENSEX/);
  assert.match(algo, /data-test2-scripts="card"/);
});
