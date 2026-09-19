import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeClientIntoList, shouldApplyFetchedList } from "../src/lib/clientListState.ts";
import {
  SECRET_FIELD_MASK,
  credsAfterInstall,
  describeBrokerInstall,
  describeBrokerSave,
  displayInstallValue,
  displaySavedSecret,
  hintsFromInstall,
  installValueForSubmit,
  savedSecretForSubmit,
  tradingTokenArrived,
} from "../src/lib/formSecrets.ts";

test("after save the client ID stays visible and the token field shows a mask, not an empty box", () => {
  const install = { accountId: "1100333", tokenHint: "dh••••9999", apiKeyHint: "" };
  const hints = hintsFromInstall(install);
  const creds = credsAfterInstall(install, { clientId: "1100333", accessToken: "dhan-replaced-token-9999" });
  assert.deepEqual(creds, { clientId: "1100333" });
  assert.equal(displayInstallValue({ id: "clientId" }, creds, hints), "1100333");
  assert.equal(displayInstallValue({ id: "accessToken", secret: true }, creds, hints), SECRET_FIELD_MASK);
  assert.equal(installValueForSubmit({ id: "accessToken", secret: true }, creds, hints), "");
  assert.equal(installValueForSubmit({ id: "clientId" }, creds, hints), "1100333");
});

test("saved Dhan client ID replaces a leftover Upstox value after broker switch", () => {
  assert.deepEqual(credsAfterInstall({ accountId: "11008802" }, { clientId: "UPX1001" }), { clientId: "11008802" });
  assert.deepEqual(credsAfterInstall({ accountId: "" }, {}), {});
});

test("a poll does not overwrite a Dhan client ID the user is typing", () => {
  assert.deepEqual(
    credsAfterInstall({ accountId: "UPX1001" }, { clientId: "11008802" }, { keepTyped: true }),
    { clientId: "11008802" },
  );
});

test("a poll keeps typed API key and secret so Save can store them", () => {
  const next = credsAfterInstall(
    { accountId: "393216" },
    {
      clientId: "393216",
      apiKey: "upstox-api-key-11111111",
      sessionToken: "upstox-api-secret-22222222",
      accessToken: SECRET_FIELD_MASK,
    },
    { keepTyped: true },
  );
  assert.equal(next.clientId, "393216");
  assert.equal(next.apiKey, "upstox-api-key-11111111");
  assert.equal(next.sessionToken, "upstox-api-secret-22222222");
  assert.equal(next.accessToken, undefined);
  assert.equal(installValueForSubmit({ id: "apiKey", secret: true }, next, hintsFromInstall({ apiKeyHint: "up••••1111" })), "upstox-api-key-11111111");
  assert.equal(
    installValueForSubmit({ id: "sessionToken", secret: true }, next, hintsFromInstall({ sessionHint: "up••••2222" })),
    "upstox-api-secret-22222222",
  );
});

test("My plan says when API key and secret are saved but the trading token is not", () => {
  const install = {
    brokerId: "upstox",
    accountId: "393216",
    apiKeyHint: "up••••1111",
    sessionHint: "up••••2222",
    hasApiKey: true,
    hasApiSecret: true,
    oauthReady: true,
    installed: false,
  };
  assert.match(describeBrokerInstall(install, "upstox"), /API key/);
  assert.match(describeBrokerInstall(install, "upstox"), /API secret/);
  assert.match(describeBrokerInstall(install, "upstox"), /No trading token yet/);
  assert.match(describeBrokerSave(install, "upstox"), /Tap Get today's trading token/);
  assert.equal(tradingTokenArrived(install, install), false);
  assert.equal(
    tradingTokenArrived(install, { installed: true, tokenHint: "up••••64MI", tokenUpdatedAt: "2026-09-19T10:00:00.000Z" }),
    true,
  );
});

test("a masked token is never submitted as a replacement secret", () => {
  assert.equal(savedSecretForSubmit(""), "");
  assert.equal(savedSecretForSubmit(SECRET_FIELD_MASK), "");
  assert.equal(savedSecretForSubmit("  new-live-token  "), "new-live-token");
  assert.equal(displaySavedSecret("", "ab••••oken"), SECRET_FIELD_MASK);
  assert.equal(displaySavedSecret("paste-me", "ab••••oken"), "paste-me");
});

test("a later upsert wins over a stale in-flight client list", () => {
  let epoch = 0;
  const stale = {
    clients: [{ id: "u1", name: "Ada", accountId: "", tokenHint: "", status: "PAPER ONLY" }],
    live: 0,
    paper: 1,
  };
  const saved = { id: "u1", name: "Ada", accountId: "1100333", tokenHint: "dh••••9999", status: "LIVE" };
  const started = epoch;
  epoch += 1;
  const cached = mergeClientIntoList(stale, saved);
  assert.equal(shouldApplyFetchedList(started, epoch), false);
  assert.equal(cached.clients[0].accountId, "1100333");
  assert.equal(cached.clients[0].tokenHint, "dh••••9999");
});
