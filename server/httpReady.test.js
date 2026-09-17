import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import express from "express";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  attachHttpServerGuards,
  httpErrorHandler,
  sendReadyPage,
  skipDhanBoot,
  skipLiveAlgos,
  loginGatePort,
  withTimeout,
} from "./httpReady.js";

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

test("skipDhanBoot reads T2S_SKIP_DHAN_BOOT", () => {
  assert.equal(skipDhanBoot({}), false);
  assert.equal(skipDhanBoot({ T2S_SKIP_DHAN_BOOT: "1" }), true);
  assert.equal(skipDhanBoot({ T2S_SKIP_DHAN_BOOT: "true" }), true);
});

test("skipLiveAlgos reads T2S_SKIP_LIVE_ALGOS", () => {
  assert.equal(skipLiveAlgos({}), false);
  assert.equal(skipLiveAlgos({ T2S_SKIP_LIVE_ALGOS: "1" }), true);
});

test("loginGatePort defaults to 3999", () => {
  assert.equal(loginGatePort({}), 3999);
  assert.equal(loginGatePort({ T2S_LOGIN_PORT: "4010" }), 4010);
});

test("withTimeout rejects after the limit", async () => {
  await assert.rejects(
    () => withTimeout(new Promise(() => {}), 20, "too slow"),
    /too slow/,
  );
});

test("GET / returns 200 even when dist is missing", async () => {
  const app = express();
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "t2s-api" });
  });
  app.get(["/", "/index.html"], (_req, res) => {
    sendReadyPage(res, "");
  });
  app.use(httpErrorHandler);
  const server = attachHttpServerGuards(
    app.listen(0, "127.0.0.1"),
  );
  await new Promise((resolve, reject) => {
    server.on("listening", resolve);
    server.on("error", reject);
  });
  const { port } = server.address();
  try {
    const home = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Trade 2 Smart/);
    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("HTTP errors complete the response instead of resetting the socket", async () => {
  const app = express();
  app.get("/api/boom", () => {
    throw new Error("desk exploded");
  });
  app.use(httpErrorHandler);
  const server = attachHttpServerGuards(app.listen(0, "127.0.0.1"));
  await new Promise((resolve, reject) => {
    server.on("listening", resolve);
    server.on("error", reject);
  });
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/boom`);
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error, "Server error");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("spawned API answers GET / and /api/health before Dhan boot", async (t) => {
  const port = await listenPort();
  const child = spawn(process.execPath, ["index.js"], {
    cwd: __dirname,
    env: {
      ...process.env,
      PORT: String(port),
      T2S_SKIP_DHAN_BOOT: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    if (!child.killed) child.kill("SIGKILL");
    if (child.exitCode == null && child.signalCode == null) {
      await new Promise((resolve) => child.once("exit", resolve));
    }
  });
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 20_000) {
    try {
      const home = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(home.status, 200);
      const health = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(health.status, 200);
      const body = await health.json();
      assert.equal(body.ok, true);
      assert.equal(body.service, "t2s-api");
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw lastError || new Error("API never answered on port " + port);
});
