import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const deployDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "deploy");

function render(certDir, webroot = "/var/www/trade2smart") {
  const py = [
    "import sys",
    "from pathlib import Path",
    "sys.path.insert(0, sys.argv[1])",
    "from write_nginx_trade2smart import render_nginx_conf",
    "print(render_nginx_conf(sys.argv[2], Path(sys.argv[3])))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", py, deployDir, webroot, certDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("nginx conf never roots files under /root and proxies API", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /listen 80/);
  assert.doesNotMatch(text, /listen 443/);
  assert.match(text, /root \/var\/www\/trade2smart/);
  assert.doesNotMatch(text, /root \/root\//);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:4000/);
  assert.match(text, /@node/);
});

test("nginx conf enables HTTPS when Let's Encrypt files exist", () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-certs-"));
  fs.writeFileSync(path.join(certDir, "fullchain.pem"), "cert\n");
  fs.writeFileSync(path.join(certDir, "privkey.pem"), "key\n");
  const text = render(certDir);
  assert.match(text, /listen 443 ssl/);
  assert.match(text, /return 301 https:\/\//);
  assert.equal(text.includes(certDir), true);
  assert.doesNotMatch(text, /root \/root\//);
  fs.rmSync(certDir, { recursive: true, force: true });
});
