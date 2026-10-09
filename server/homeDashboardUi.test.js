import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Home dashboard uses tapes instead of leftover cards", () => {
  const home = fs.readFileSync(path.join(root, "src/pages/Dashboard.tsx"), "utf8");
  const options = fs.readFileSync(path.join(root, "src/pages/Options.tsx"), "utf8");

  assert.match(home, /data-home-layout="tapes"/);
  assert.match(home, /TickerStrip/);
  assert.match(home, /MarketDNA/);
  assert.match(home, /InstitutionalFlow/);
  assert.equal(home.includes("OptionChain"), false);
  assert.equal(home.includes("FuturesTape"), false);
  assert.equal(home.includes("xl:grid-cols-3"), false);
  assert.equal(fs.existsSync(path.join(root, "src/components/dashboard/OptionChain.tsx")), false);
  assert.equal(fs.existsSync(path.join(root, "src/components/dashboard/FuturesTape.tsx")), false);
  assert.match(options, /<h1 className="text-xl font-bold">Option Chain<\/h1>/);
});

test("Market info widgets render DeskTape cells", () => {
  const files = [
    "src/components/dashboard/DeskTape.tsx",
    "src/components/dashboard/MarketDNA.tsx",
    "src/components/dashboard/SentimentGauge.tsx",
    "src/components/dashboard/InstitutionalFlow.tsx",
    "src/components/dashboard/AISignal.tsx",
    "src/components/dashboard/RecentSignals.tsx",
    "src/components/dashboard/MemberIndexBoard.tsx",
    "src/pages/UserHome.tsx",
    "src/pages/Analytics.tsx",
    "src/pages/Markets.tsx",
  ];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(root, rel), "utf8");
    assert.match(text, /DeskTape|TapeCell|data-desk-tape|data-market-tape/, rel);
    assert.equal(text.includes("RadarChart"), false, rel);
    assert.equal(text.includes("<Gauge"), false, rel);
  }
});

test("Home chart candles refresh every 15s, not every 2s", () => {
  const chart = fs.readFileSync(path.join(root, "src/components/dashboard/PriceChart.tsx"), "utf8");
  assert.match(chart, /setInterval\(\(\) => void load\(\), 15000\)/);
  assert.equal(chart.includes("dhanLive ? 2000"), false);
});
