import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Market tape shows Option Chain lots and hides the extra chip row", () => {
  const tape = fs.readFileSync(path.join(root, "src/components/dashboard/TickerStrip.tsx"), "utf8");
  const options = fs.readFileSync(path.join(root, "src/pages/Options.tsx"), "utf8");
  const markets = fs.readFileSync(path.join(root, "src/lib/markets.ts"), "utf8");

  assert.match(tape, /data-market-tape="option-lots"/);
  assert.match(tape, /\$\{row\.label\} · \$\{row\.lot\}/);
  assert.match(tape, /OPTION_UNDERLYINGS\.map/);
  assert.match(tape, />Lot</);
  assert.match(markets, /\{ id: "NIFTY", label: "NIFTY", lot: 65 \}/);
  assert.match(markets, /\{ id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 \}/);
  assert.match(markets, /\{ id: "FINNIFTY", label: "FINNIFTY", lot: 60 \}/);
  assert.match(markets, /\{ id: "MIDCPNIFTY", label: "MIDCPNIFTY", lot: 50 \}/);
  assert.match(markets, /\{ id: "SENSEX", label: "SENSEX", lot: 20 \}/);
  assert.match(markets, /\{ id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 \}/);
  assert.match(markets, /\{ id: "NATURALGAS", label: "NATURAL GAS", lot: 1250 \}/);
  assert.match(markets, /\{ id: "COPPER", label: "COPPER", lot: 2500 \}/);
  assert.equal(options.includes("{item.label} · {item.lot}"), false);
  assert.match(options, /TickerStrip selectedId/);
});
