import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const finder = path.join(repoRoot, "deploy", "t2s-home.sh");

function findHome(env) {
  const script = `. "${finder}"; t2s_find_home`;
  const result = spawnSync("bash", ["-c", script], {
    cwd: os.tmpdir(),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { code: result.status, out: String(result.stdout || "").trim(), err: String(result.stderr || "") };
}

test("t2s-home prefers download/algo over t2s", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const algo = path.join(root, "download", "algo");
  const old = path.join(root, "t2s");
  fs.mkdirSync(path.join(algo, "server"), { recursive: true });
  fs.mkdirSync(path.join(old, "server"), { recursive: true });
  fs.writeFileSync(path.join(algo, "server", "index.js"), "export {};\n");
  fs.writeFileSync(path.join(old, "server", "index.js"), "export {};\n");
  const found = findHome({ T2S_HOME_SEARCH: root });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, algo);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s-home honors T2S_HOME when server/index.js exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const home = path.join(root, "custom", "desk");
  fs.mkdirSync(path.join(home, "server"), { recursive: true });
  fs.writeFileSync(path.join(home, "server", "index.js"), "export {};\n");
  const found = findHome({ T2S_HOME: home, T2S_HOME_SEARCH: "/tmp/does-not-exist-t2s" });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, home);
  fs.rmSync(root, { recursive: true, force: true });
});
