import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Home dashboard drops Option Chain and Index futures cards", () => {
  const home = fs.readFileSync(path.join(root, "src/pages/Dashboard.tsx"), "utf8");
  const options = fs.readFileSync(path.join(root, "src/pages/Options.tsx"), "utf8");

  assert.match(home, /data-home-widgets="no-option-chain-no-futures"/);
  assert.match(home, /InstitutionalFlow/);
  assert.equal(home.includes("OptionChain"), false);
  assert.equal(home.includes("FuturesTape"), false);
  assert.equal(home.includes("Derivatives"), false);
  assert.equal(home.includes("Index futures"), false);
  assert.equal(fs.existsSync(path.join(root, "src/components/dashboard/OptionChain.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/components/dashboard/FuturesTape.tsx")), false);
  assert.match(options, /<h1 className="text-xl font-bold">Option Chain<\/h1>/);
});
