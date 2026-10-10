import assert from "node:assert/strict";
import test from "node:test";
import { deskOriginFromHost, deskStartPath, isDeskLoginUrl, LIVE_DESK, sessionBootstrapScript } from "../mobile/src/deskUrl.js";

test("local Expo uses the LAN Vite desk so the phone gets the advanced web UI", () => {
  assert.equal(deskOriginFromHost("192.168.1.20:8081"), "http://192.168.1.20:5173");
  assert.equal(deskOriginFromHost("", "https://trade2smart.com/"), "https://trade2smart.com");
  assert.equal(deskOriginFromHost(""), LIVE_DESK);
});

test("admin opens Algo and members open the member home", () => {
  assert.equal(deskStartPath("admin"), "/algo");
  assert.equal(deskStartPath("user"), "/");
  assert.equal(deskStartPath(""), "/");
});

test("session bootstrap writes the same keys the web desk reads", () => {
  const script = sessionBootstrapScript("tok-1", { id: "u1", role: "admin" }, "/algo");
  assert.match(script, /t2s-token/);
  assert.match(script, /tok-1/);
  assert.match(script, /t2s-user/);
  assert.match(script, /\/algo/);
  assert.equal(isDeskLoginUrl("https://trade2smart.com/login"), true);
  assert.equal(isDeskLoginUrl("http://192.168.1.20:5173/#/login"), true);
  assert.equal(isDeskLoginUrl("https://trade2smart.com/algo"), false);
});
