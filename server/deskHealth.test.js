import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { deskHealthPayload, probeDeskHealth } from "./deskHealth.js";

test("desk health payload is cheap and always ok", () => {
  const row = deskHealthPayload({ dhanLive: true });
  assert.equal(row.ok, true);
  assert.equal(row.service, "t2s");
  assert.equal(row.dhanLive, true);
});

test("probeDeskHealth is false when the desk port does not answer", async () => {
  const row = await probeDeskHealth({
    url: "http://127.0.0.1:9/api/desk-health",
    timeoutMs: 200,
  });
  assert.equal(row.ok, false);
});

test("t2s stays up: desk-health, faster watch, and no systemd start limit", () => {
  const indexSrc = fs.readFileSync(new URL("./index.js", import.meta.url), "utf8");
  assert.match(indexSrc, /\/api\/desk-health/);
  assert.match(indexSrc, /void ensureMemberDataFeedsRunning\("deploy"\)/);
  const watch = fs.readFileSync(new URL("../deploy/t2s-health-watch.sh", import.meta.url), "utf8");
  assert.match(watch, /\/api\/desk-health/);
  const timer = fs.readFileSync(new URL("../deploy/t2s-health-watch.timer", import.meta.url), "utf8");
  assert.match(timer, /OnUnitActiveSec=15s/);
  const unit = fs.readFileSync(new URL("../deploy/t2s.service", import.meta.url), "utf8");
  assert.match(unit, /StartLimitIntervalSec=0/);
  const nginx = fs.readFileSync(new URL("../deploy/write_nginx_trade2smart.py", import.meta.url), "utf8");
  assert.match(nginx, /location = \/api\/desk-health/);
  const gate = fs.readFileSync(new URL("./loginGate.js", import.meta.url), "utf8");
  assert.match(gate, /deskUp/);
});
