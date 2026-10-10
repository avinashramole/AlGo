import assert from "node:assert/strict";
import test from "node:test";
import { APP_LOGIN_ORIGIN, deskHomeUrl, googleAppIntentUrl, googleDeskHashUrl, googleLoginNextFrom, googleQueryFromHref, isLiveDeskHref } from "../src/lib/hybrid.ts";

test("native Google login returns to the app scheme, not the website", () => {
  assert.equal(googleLoginNextFrom({ native: true }), APP_LOGIN_ORIGIN);
  assert.equal(googleLoginNextFrom({ native: false, origin: "https://trade2smart.com" }), "https://trade2smart.com");
  assert.equal(googleLoginNextFrom({ native: false, origin: "http://localhost:5173" }), "http://localhost:5173");
  assert.equal(isLiveDeskHref("https://trade2smart.com/#/"), true);
  assert.equal(isLiveDeskHref("t2salgo://auth?google_token=abc"), false);
  assert.equal(googleDeskHashUrl("google_token=abc"), "https://trade2smart.com/#/?google_token=abc");
  assert.equal(
    googleAppIntentUrl("google_token=abc"),
    "intent://auth?google_token=abc#Intent;scheme=t2salgo;package=com.t2s.algo;end",
  );
  assert.equal(deskHomeUrl(), "/");
});

test("Google callback query is read from website, hash, and app scheme URLs", () => {
  const web = googleQueryFromHref("https://trade2smart.com/login?google_token=abc&google_email=a@gmail.com");
  assert.equal(web.get("google_token"), "abc");
  const hash = googleQueryFromHref("https://trade2smart.com/#/login?google_token=hash-token");
  assert.equal(hash.get("google_token"), "hash-token");
  const deskHash = googleQueryFromHref("https://trade2smart.com/#/?google_token=desk-token");
  assert.equal(deskHash.get("google_token"), "desk-token");
  const app = googleQueryFromHref("t2salgo://auth?google_token=app-token&google_name=Asha");
  assert.equal(app.get("google_token"), "app-token");
  assert.equal(app.get("google_name"), "Asha");
});
