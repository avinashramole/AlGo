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

  assert.match(tape, /OPTION_UNDERLYINGS\.map/);
  assert.match(tape, /tapeScriptTitle/);
  assert.doesNotMatch(tape, /tapeLotLine/);
  assert.doesNotMatch(tape, />Lot</);
  assert.match(tape, /TapeTodayChange/);
  assert.doesNotMatch(tape, /item\.future \|\| item\.price/);
  assert.doesNotMatch(tape, /quote\?\.future \|\| quote\?\.price/);
  const deskTape = fs.readFileSync(path.join(root, "src/components/dashboard/DeskTape.tsx"), "utf8");
  assert.match(deskTape, /data-market-tape/);
  const format = fs.readFileSync(path.join(root, "src/lib/format.ts"), "utf8");
  assert.match(format, /export function tapeScriptTitle/);
  assert.doesNotMatch(format, /Lot · \$\{rows/);
  const memberTape = fs.readFileSync(path.join(root, "src/components/dashboard/MemberIndexBoard.tsx"), "utf8");
  const today = fs.readFileSync(path.join(root, "src/components/dashboard/TapeTodayChange.tsx"), "utf8");
  assert.match(memberTape, /TapeTodayChange/);
  assert.match(memberTape, /tapeScriptTitle/);
  assert.doesNotMatch(memberTape, /tapeLotLine/);
  assert.match(memberTape, /tapeSessionLabel/);
  assert.doesNotMatch(memberTape, />Lot</);
  assert.match(today, /data-today-change="true"/);
  assert.match(today, />Today</);
  assert.match(today, /quoteTone/);
  assert.match(today, /bg-emerald-50/);
  assert.match(today, /bg-rose-50/);
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
