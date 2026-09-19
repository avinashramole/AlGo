import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeClientIntoList, shouldApplyFetchedList } from "../src/lib/clientListState.ts";
import {
  SECRET_FIELD_MASK,
  credsAfterInstall,
  displayInstallValue,
  displaySavedSecret,
  hintsFromInstall,
  installValueForSubmit,
  savedSecretForSubmit,
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
