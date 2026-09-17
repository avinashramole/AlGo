import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const finder = path.join(repoRoot, "deploy", "t2s-home.sh");

function runFinder(env, extra = "") {
  const script = `. "${finder}"; ${extra || "t2s_find_home"}`;
  const result = spawnSync("bash", ["-c", script], {
    cwd: os.tmpdir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { code: result.status, out: String(result.stdout || "").trim(), err: String(result.stderr || "") };
}

test("t2s-home prefers the checkout that ran the script", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const scriptHome = path.join(root, "live");
  const other = path.join(root, "t2s");
  fs.mkdirSync(path.join(scriptHome, "server"), { recursive: true });
  fs.mkdirSync(path.join(other, "server"), { recursive: true });
  fs.writeFileSync(path.join(scriptHome, "server", "index.js"), "export {};\n");
  fs.writeFileSync(path.join(other, "server", "index.js"), "export {};\n");
  const found = runFinder({ T2S_SCRIPT_HOME: scriptHome, T2S_HOME_SEARCH: root });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, scriptHome);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s-home prefers /opt-style t2s over download/algo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const algo = path.join(root, "download", "algo");
  const vps = path.join(root, "t2s");
  fs.mkdirSync(path.join(algo, "server"), { recursive: true });
  fs.mkdirSync(path.join(vps, "server"), { recursive: true });
  fs.writeFileSync(path.join(algo, "server", "index.js"), "export {};\n");
  fs.writeFileSync(path.join(vps, "server", "index.js"), "export {};\n");
  const found = runFinder({ T2S_HOME_SEARCH: root });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, vps);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s-home honors T2S_HOME when server/index.js exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const home = path.join(root, "custom", "desk");
  fs.mkdirSync(path.join(home, "server"), { recursive: true });
  fs.writeFileSync(path.join(home, "server", "index.js"), "export {};\n");
  const found = runFinder({ T2S_HOME: home, T2S_HOME_SEARCH: "/tmp/does-not-exist-t2s" });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, home);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s_has_server_modules is false until cors is present", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  const missing = runFinder({}, `t2s_has_server_modules "${root}"; echo $?`);
  assert.match(missing.out, /1$/);
  fs.mkdirSync(path.join(root, "server", "node_modules", "cors"), { recursive: true });
  const present = runFinder({}, `t2s_has_server_modules "${root}"; echo $?`);
  assert.match(present.out, /0$/);
  fs.rmSync(root, { recursive: true, force: true });
});
