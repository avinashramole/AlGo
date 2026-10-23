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

test("nginx gzip and long-cache hashed /assets so first load is smaller", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /gzip on;/);
  assert.match(text, /gzip_types/);
  assert.match(text, /location \^~ \/assets\//);
  assert.match(text, /max-age=2592000/);
  assert.match(text, /Cache-Control "no-cache"/);
});

test("nginx conf never roots files under /root and proxies API", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /listen 80/);
  assert.doesNotMatch(text, /listen 443/);
  assert.match(text, /root \/var\/www\/trade2smart/);
  assert.doesNotMatch(text, /root \/root\//);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:4000/);
  assert.doesNotMatch(text, /@node/);
});

test("nginx keeps Run backtest open for 180s so the 15s API timeout cannot 504 t2s", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /location ~ \^\/api\/algos\/\[\^\/\]\+\/backtest\$/);
  assert.match(text, /proxy_read_timeout 180s/);
  assert.match(text, /proxy_send_timeout 180s/);
});

test("nginx conf sends login and health to the 3999 gate", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /location = \/api\/login/);
  assert.match(text, /location = \/api\/health/);
  assert.match(text, /location = \/api\/desk-health/);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:3999/);
  assert.match(text, /proxy_pass http:\/\/127\.0\.0\.1:4000/);
  assert.match(text, /proxy_read_timeout 2s/);
});

test("nginx conf enables HTTPS when Let's Encrypt files exist", () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-certs-"));
  fs.writeFileSync(path.join(certDir, "fullchain.pem"), "cert\n");
  fs.writeFileSync(path.join(certDir, "privkey.pem"), "key\n");
  const text = render(certDir);
  assert.match(text, /listen 443 ssl/);
  assert.match(text, /return 301 https:\/\//);
  assert.match(text, /ssl_protocols TLSv1\.2/);
  assert.doesNotMatch(text, /options-ssl-nginx/);
  assert.equal(text.includes(certDir), true);
  assert.doesNotMatch(text, /root \/root\//);
  fs.rmSync(certDir, { recursive: true, force: true });
});

test("nginx conf finds archive fullchain1.pem", () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-archive-"));
  fs.writeFileSync(path.join(certDir, "fullchain1.pem"), "cert\n");
  fs.writeFileSync(path.join(certDir, "privkey1.pem"), "key\n");
  const text = render(certDir);
  assert.match(text, /listen 443 ssl/);
  assert.match(text, /fullchain1\.pem/);
  fs.rmSync(certDir, { recursive: true, force: true });
});

test("nginx conf can force listen 443 with an explicit cert pair", () => {
  const certDir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-forced-"));
  const crt = path.join(certDir, "force.crt");
  const key = path.join(certDir, "force.key");
  fs.writeFileSync(crt, "cert\n");
  fs.writeFileSync(key, "key\n");
  const py = [
    "import sys",
    "from pathlib import Path",
    "sys.path.insert(0, sys.argv[1])",
    "from write_nginx_trade2smart import render_nginx_conf",
    "print(render_nginx_conf(sys.argv[2], Path('/tmp/t2s-no-certs'), (Path(sys.argv[3]), Path(sys.argv[4]))))",
  ].join("\n");
  const result = spawnSync("python3", ["-c", py, deployDir, "/var/www/trade2smart", crt, key], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /listen 443 ssl/);
  assert.match(result.stdout, /force\.crt/);
  fs.rmSync(certDir, { recursive: true, force: true });
});

test("nginx writer is safe on Python 3.6 (AlmaLinux 8)", () => {
  const src = fs.readFileSync(path.join(deployDir, "write_nginx_trade2smart.py"), "utf8");
  assert.doesNotMatch(src, /^from __future__ import annotations/m);
  const parsed = spawnSync(
    "python3",
    ["-c", "import ast,sys; ast.parse(open(sys.argv[1], encoding='utf-8').read())", path.join(deployDir, "write_nginx_trade2smart.py")],
    { encoding: "utf8" },
  );
  assert.equal(parsed.status, 0, parsed.stderr || parsed.stdout);
});

test("website deploy rewrites nginx so gzip lands on the VPS", () => {
  const src = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(src, /write_nginx_trade2smart\.py/);
});

test("website deploy installs npm packages before tsc", () => {
  const src = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(src, /npm install --no-audit --no-fund/);
  assert.match(src, /@capacitor\/browser/);
});

test("website deploy accepts first-candle 5m 15m 30m 1H custom and does not require the old FIRST_CANDLE_TIMEFRAMES[algo.timeframe] gate", () => {
  const src = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(src, /resolveFirstCandleTimeframe/);
  assert.match(src, /data-first-candle-timeframe-bar/);
  assert.match(src, /first-candle-timeframe-bar/);
  assert.match(src, /DESK_TIMEFRAME_PRESETS = \\\["5m", "15m", "30m", "1H"\\\]/);
  assert.doesNotMatch(src, /"30m", "60m"/);
  assert.doesNotMatch(src, /FIRST_CANDLE_TIMEFRAMES\\\[algo\.timeframe\\\]/);
});

test("nginx serves /deploy/github.sh as a script and never falls back to index.html", () => {
  const text = render("/tmp/t2s-no-certs");
  assert.match(text, /location = \/deploy\/github\.sh/);
  assert.match(text, /try_files \/deploy\/github\.sh =404/);
  const github = fs.readFileSync(path.join(deployDir, "github.sh"), "utf8");
  assert.match(github, /^#!/);
  assert.doesNotMatch(github, /<!doctype html>/i);
  assert.match(github, /raw\.githubusercontent\.com\/avinashramole\/AlGo\/\$\{BRANCH\}\/deploy\/update-website\.sh/);
  const published = fs.readFileSync(path.join(deployDir, "..", "public", "deploy", "github.sh"), "utf8");
  assert.equal(published, github);
  const updater = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(updater, /WEBROOT\/deploy\/github\.sh/);
});

test("website deploy hard-resets to origin/branch instead of a stale sparse pull", () => {
  const src = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(src, /git reset --hard HEAD \|\| true/);
  assert.match(src, /git checkout -f -B "\$BRANCH" "origin\/\$BRANCH"/);
  assert.match(src, /git reset --hard "origin\/\$BRANCH"/);
  assert.match(src, /raw.githubusercontent.com\/avinashramole\/AlGo\/main\/deploy\/update-website.sh/);
  assert.match(src, /dist\/version.json/);
  assert.doesNotMatch(src, /git pull origin "\$BRANCH" \|\| true/);
});

test("website deploy skips GitHub file dumps when git already matches origin", () => {
  const src = fs.readFileSync(path.join(deployDir, "update-website.sh"), "utf8");
  assert.match(src, /git checkout is current; skipping GitHub file downloads/);
  assert.match(src, /data-test1-timeframe.*FirstCandleTimeframeBar/);
  assert.doesNotMatch(src, /data-test1-timeframe.*StrategyBuilder/);
  assert.doesNotMatch(src, /TEST1 Save still hardcodes 5m/);
  assert.match(src, /\{SHIVAM_T2S_BUY_RULE\}\. \{SHIVAM_T2S_SELL_RULE\}\. \{CANDLE_ENTRY_RULE\}/);
  assert.match(src, /data-shivam-rules="true"/);
  assert.doesNotMatch(src, /Do not trade a doji on the index, future, or option candle/);
  assert.doesNotMatch(src, /timeframe: \["1m", "2m", "5m", "10m", "15m"\]\.includes/);
});

test("install-t2s-service still restarts t2s if the nginx writer fails", () => {
  const src = fs.readFileSync(path.join(deployDir, "install-t2s-service.sh"), "utf8");
  assert.match(src, /if ! python3 .*write_nginx_trade2smart\.py/s);
  assert.match(src, /Leaving \/etc\/nginx\/conf\.d as-is and still restarting t2s/);
  assert.match(src, /systemctl start t2s/);
});
