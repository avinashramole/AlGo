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
  assert.match(builder, /data-ui=\{test2 \? "test2-script-v5"/);
  assert.equal((algo.match(/data-test2-scripts=/g) || []).length, 0);
  assert.equal(algo.includes("Script · NIFTY BANKNIFTY SENSEX"), false);
  assert.equal(algo.includes("Test2ScriptBar"), false);
  assert.match(algo, /Test2ExpiryBar/);
});

test("deploy script refuses a TEST2 form with more than one Script dropdown", () => {
  const deploy = fs.readFileSync(path.join(root, "deploy/update-website.sh"), "utf8");
  assert.match(deploy, /UI_MARKER="test2-script-v5"/);
  assert.match(deploy, /SELECTS=\$\(grep -c '<Test2ScriptSelect /);
  assert.match(deploy, /bash \/tmp\/update-website.sh cursor\/test2-one-script-6826/);
});
