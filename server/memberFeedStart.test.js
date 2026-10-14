import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { ensureMemberDataFeedsRunning, shouldResumeMemberFeeds } from "./memberFeedStart.js";

test("VPS boot and deploy resume user feeds; a watchdog tick does not spam brokers", () => {
  assert.equal(shouldResumeMemberFeeds("boot"), true);
  assert.equal(shouldResumeMemberFeeds("deploy"), true);
  assert.equal(shouldResumeMemberFeeds("live-start"), true);
  assert.equal(shouldResumeMemberFeeds("watchdog"), false);
});

test("watchdog does not ask Upstox or warm user quotes", async () => {
  let asked = 0;
  let warmed = 0;
  const result = await ensureMemberDataFeedsRunning("watchdog", {
    askUpstox: async () => {
      asked += 1;
      return { ok: true };
    },
    warmQuotes: async () => {
      warmed += 1;
      return { live: true, indices: [{ price: 1 }] };
    },
  });
  assert.equal(result.skipped, true);
  assert.equal(asked, 0);
  assert.equal(warmed, 0);
});

test("boot and deploy start admin and user feeds without a user restart", () => {
  const indexSrc = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(indexSrc, /ensureMemberDataFeedsRunning\("deploy"\)/);
  assert.match(indexSrc, /ensureMemberDataFeedsRunning\("boot"\)/);
  const marketSrc = fs.readFileSync(new URL("./market.js", import.meta.url), "utf8");
  assert.match(marketSrc, /autoStart:\s*true/);
  const deploySrc = fs.readFileSync(new URL("../deploy/update-website.sh", import.meta.url), "utf8");
  assert.match(deploySrc, /\/api\/internal\/start-data-feed/);
  const setupSrc = fs.readFileSync(new URL("../src/components/desk/MemberAccountSetup.tsx", import.meta.url), "utf8");
  assert.match(setupSrc, /no restart/i);
});
