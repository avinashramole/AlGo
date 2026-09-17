import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseScripMasterText } from "./frontFutures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function listenPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close((error) => (error ? reject(error) : resolve(port)));
    });
    probe.on("error", reject);
  });
}

test("scrip master parse yields and still finds NIFTY future", async () => {
  const csv = [
    "SEM_INSTRUMENT_NAME,SEM_TRADING_SYMBOL,SEM_EXM_EXCH_ID,SEM_EXPIRY_DATE,SEM_SMST_SECURITY_ID,SEM_LOT_UNITS,SEM_OPTION_TYPE,SEM_STRIKE_PRICE",
    "EQ,RELIANCE,NSE,2026-01-29,1,1,,",
    "FUTIDX,NIFTY-29JAN,NSE,2026-01-29,58072,65,,",
    "OPTIDX,NIFTY-29JAN,NSE,2026-01-29,111,65,CE,25000",
  ].join("\n");
  const parsed = await parseScripMasterText(csv, { T2S_SCRIP_YIELD_EVERY: "1" });
  const nifty = parsed.instruments.find((row) => row.parent === "NIFTY 50");
  assert.equal(Number(nifty?.securityId), 58072);
  assert.equal(parsed.options.size > 0, true);
});

test("login gate answers health and login without Dhan", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-login-gate-"));
  const usersFile = path.join(dir, "users.json");
  const sessionsFile = path.join(dir, "sessions.json");
  fs.writeFileSync(usersFile, "[]\n");
  fs.writeFileSync(sessionsFile, "{}\n");
  const port = await listenPort();
  const child = spawn(process.execPath, ["loginGate.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      T2S_LOGIN_PORT: String(port),
      T2S_USERS_FILE: usersFile,
      T2S_SESSIONS_FILE: sessionsFile,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (!child.killed) child.kill("SIGKILL");
    if (child.exitCode == null && child.signalCode == null) {
      await new Promise((resolve) => child.once("exit", resolve));
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 10_000) {
    try {
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(health.status, 200);
      const body = await health.json();
      assert.equal(body.ok, true);
      assert.equal(body.service, "t2s-login");
      const login = await fetch(`http://127.0.0.1:${port}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      assert.equal(login.status, 401);
      const signed = await fetch(`http://127.0.0.1:${port}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: "trades2smart@gmail.com", password: "demo123" }),
      });
      assert.equal(signed.status, 200);
      const session = await signed.json();
      assert.match(session.token, /^t2s-/);
      assert.equal(session.user.role, "admin");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  throw lastError || new Error("login gate never answered on port " + port);
});
