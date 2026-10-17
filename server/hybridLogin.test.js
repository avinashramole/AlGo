import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_LOGIN_ORIGIN,
  deskHomeUrl,
  googleAppIntentUrl,
  googleCapacitorHashUrl,
  googleDeskHashUrl,
  googleLoginNextFrom,
  googleQueryFromHref,
  isIosDevice,
  isIosHomeScreenAppFrom,
  isIosSafari,
  isLiveDeskHref,
} from "../src/lib/hybrid.ts";

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
  const cap = googleQueryFromHref("https://localhost/#/?google_token=cap-token");
  assert.equal(cap.get("google_token"), "cap-token");
  assert.equal(googleCapacitorHashUrl("google_token=abc"), "https://localhost/#/?google_token=abc");
});

test("iPhone home-screen app is detected without treating Safari as native Capacitor", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const chromeIos = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
  assert.equal(isIosDevice(iphone), true);
  assert.equal(isIosDevice("Mozilla/5.0 (Linux; Android 14)"), false);
  assert.equal(isIosDevice("", "MacIntel", 5), true);
  assert.equal(isIosSafari(iphone), true);
  assert.equal(isIosSafari(chromeIos), false);
  assert.equal(isIosHomeScreenAppFrom({ userAgent: iphone, standalone: true }), true);
  assert.equal(isIosHomeScreenAppFrom({ userAgent: iphone, displayModeStandalone: true }), true);
  assert.equal(isIosHomeScreenAppFrom({ userAgent: iphone, standalone: false }), false);
  assert.equal(googleLoginNextFrom({ native: false, origin: "https://trade2smart.com" }), "https://trade2smart.com");
});
