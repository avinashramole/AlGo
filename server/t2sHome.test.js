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

function makeCheckout(root, rel) {
  const home = path.join(root, rel);
  fs.mkdirSync(path.join(home, "server"), { recursive: true });
  fs.writeFileSync(path.join(home, "server", "index.js"), "export {};\n");
  return home;
}

test("t2s-home prefers the checkout that ran the script", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const scriptHome = makeCheckout(root, "live");
  makeCheckout(root, "t2s");
  const found = runFinder({ T2S_SCRIPT_HOME: scriptHome, T2S_HOME_SEARCH: root, T2S_VPS_HOME: path.join(root, "missing") });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, scriptHome);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s-home prefers /opt-style t2s over download/algo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  makeCheckout(root, path.join("download", "algo"));
  const vps = makeCheckout(root, "t2s");
  const found = runFinder({ T2S_HOME_SEARCH: root, T2S_VPS_HOME: path.join(root, "missing") });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, vps);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s-home honors T2S_HOME when server/index.js exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const home = makeCheckout(root, path.join("custom", "desk"));
  const found = runFinder({ T2S_HOME: home, T2S_HOME_SEARCH: "/tmp/does-not-exist-t2s", T2S_VPS_HOME: path.join(root, "missing") });
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

test("t2s_is_pc_path detects download/algo", () => {
  const yes = runFinder({}, `t2s_is_pc_path /root/download/algo; echo $?`);
  assert.match(yes.out, /0$/);
  const no = runFinder({}, `t2s_is_pc_path /opt/t2s; echo $?`);
  assert.match(no.out, /1$/);
});

test("canonical VPS home wins over T2S_SCRIPT_HOME download/algo", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const algo = makeCheckout(root, path.join("download", "algo"));
  const vps = makeCheckout(root, "opt-t2s");
  const found = runFinder({
    T2S_SCRIPT_HOME: algo,
    T2S_VPS_HOME: vps,
    T2S_HOME_SEARCH: root,
  });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, vps);
  fs.rmSync(root, { recursive: true, force: true });
});

test("T2S_HOME download/algo loses to canonical VPS home", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const algo = makeCheckout(root, path.join("download", "algo"));
  const vps = makeCheckout(root, "opt-t2s");
  const found = runFinder({
    T2S_HOME: algo,
    T2S_VPS_HOME: vps,
    T2S_HOME_SEARCH: "/tmp/does-not-exist-t2s",
  });
  assert.equal(found.code, 0, found.err);
  assert.equal(found.out, vps);
  fs.rmSync(root, { recursive: true, force: true });
});

test("t2s_seed_opt_t2s copies a PC-style checkout to the VPS home", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-home-"));
  const algo = makeCheckout(root, path.join("download", "algo"));
  fs.writeFileSync(path.join(algo, ".env"), "PORT=4000\n");
  fs.mkdirSync(path.join(algo, ".git"));
  fs.writeFileSync(path.join(algo, ".git", "HEAD"), "ref: refs/heads/main\n");
  const vps = path.join(root, "opt-t2s");
  const seeded = runFinder({ T2S_VPS_HOME: vps }, `t2s_seed_opt_t2s "${algo}"; echo $?`);
  assert.match(seeded.out, /0$/);
  assert.ok(fs.existsSync(path.join(vps, "server", "index.js")));
  assert.equal(fs.readFileSync(path.join(vps, ".env"), "utf8"), "PORT=4000\n");
  assert.equal(fs.readFileSync(path.join(vps, ".git", "HEAD"), "utf8"), "ref: refs/heads/main\n");
  fs.rmSync(root, { recursive: true, force: true });
});
