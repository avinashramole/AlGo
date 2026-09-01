import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadDotEnvFiles, overlayEnvMaps, parseEnvText, upsertDhanEnv } from "./env.js";

test("parseEnvText ignores comments and strips quotes", () => {
  const map = parseEnvText(`# hi\nDHAN_PIN=1234\nDHAN_TOTP_SECRET="abc def"\n`);
  assert.equal(map.DHAN_PIN, "1234");
  assert.equal(map.DHAN_TOTP_SECRET, "abc def");
});

test("overlayEnvMaps lets later files win", () => {
  const merged = overlayEnvMaps([{ DHAN_PIN: "1111", DHAN_CLIENT_ID: "a" }, { DHAN_PIN: "9999" }]);
  assert.equal(merged.DHAN_PIN, "9999");
  assert.equal(merged.DHAN_CLIENT_ID, "a");
});

test("loadDotEnvFiles prefers the newest file over systemd values", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-env-"));
  fs.writeFileSync(path.join(root, ".env"), "DHAN_PIN=1111\nDHAN_CLIENT_ID=old\n");
  const later = Date.now() / 1000 + 5;
  fs.writeFileSync(path.join(root, "tokan.env"), "DHAN_PIN=9999\nDHAN_TOTP_SECRET=JBSWY3DPEHPK3PXP\n");
  fs.utimesSync(path.join(root, "tokan.env"), later, later);
  const env = { DHAN_PIN: "0000" };
  const merged = loadDotEnvFiles({ root, env });
  assert.equal(merged.DHAN_PIN, "9999");
  assert.equal(env.DHAN_PIN, "9999");
  assert.equal(env.DHAN_TOTP_SECRET, "JBSWY3DPEHPK3PXP");
  fs.rmSync(root, { recursive: true, force: true });
});

test("upsertDhanEnv writes .env and tokan.env without dropping other keys", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-env-"));
  fs.writeFileSync(path.join(root, ".env"), "DHAN_CLIENT_ID=keep-me\nGMAIL_USER=a@b.com\n");
  const env = {};
  upsertDhanEnv({ pin: "2468", totpSecret: "JBSWY3DPEHPK3PXP" }, { root, env });
  const text = fs.readFileSync(path.join(root, ".env"), "utf8");
  const twin = fs.readFileSync(path.join(root, "tokan.env"), "utf8");
  assert.match(text, /DHAN_CLIENT_ID=keep-me/);
  assert.match(text, /DHAN_PIN=2468/);
  assert.match(text, /GMAIL_USER=a@b.com/);
  assert.match(twin, /DHAN_PIN=2468/);
  assert.equal(env.DHAN_PIN, "2468");
  fs.rmSync(root, { recursive: true, force: true });
});
