import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-option-chain-map-"));
process.env.T2S_OPTION_CHAIN_MAP_FILE = path.join(dir, "option-chain-map.json");
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");

const { dropOptionChainMappedClient, getOptionChainMap, isManualChainOrder, optionChainCopyAlgo, saveOptionChainMap } =
  await import("./optionChainMap.js");
const { fanOutAdminOrderCopies, drainPendingLiveAlgoOrders, snapshot } = await import("./market.js");
const { installMemberBroker, saveClientSettings, selectMemberBroker } = await import("./memberDesk.js");
const { memberCopyPayloads } = await import("./liveCopy.js");

function liveMappedUser(id = "u-chain-map") {
  const user = { id, name: "Chain Copy", email: `${id}@t2s.app`, role: "user" };
  selectMemberBroker({ user, brokerId: "dhan" });
  installMemberBroker({ user, brokerId: "dhan", clientId: "11007777", accessToken: "chain-member-token" });
  saveClientSettings(user.id, { copy: true });
  return user;
}

test("option chain map defaults to both with nobody mapped", () => {
  const map = getOptionChainMap();
  assert.equal(map.mappingScope, "both");
  assert.deepEqual(map.mappedClientIds, []);
});

test("manual chain orders are option or future without a strategy", () => {
  assert.equal(isManualChainOrder({ kind: "option" }), true);
  assert.equal(isManualChainOrder({ kind: "future" }), true);
  assert.equal(isManualChainOrder({ kind: "option", strategy: "NIFTY" }), false);
  assert.equal(isManualChainOrder({ kind: "option", strategy: "manual" }), true);
  assert.equal(isManualChainOrder({ symbol: "NIFTY 25000 CE" }), false);
});

test("saveOptionChainMap keeps selected clients and drops them when asked", () => {
  const saved = saveOptionChainMap({ mappingScope: "both", mappedClientIds: ["u-keep", "admin", ""] });
  assert.equal(saved.mappingScope, "both");
  assert.equal(saved.mappedClientIds.includes("u-keep"), true);
  assert.equal(saved.mappedClientIds.includes("admin"), false);
  assert.equal(dropOptionChainMappedClient("u-keep"), true);
  assert.equal(getOptionChainMap().mappedClientIds.includes("u-keep"), false);
});

test("option chain map copies a mapped user on a manual BUY", () => {
  drainPendingLiveAlgoOrders();
  const user = liveMappedUser("u-chain-live");
  saveOptionChainMap({ mappingScope: "both", mappedClientIds: [user.id] });
  const copies = memberCopyPayloads(
    { strategy: "", qty: 65, lotSize: 65, side: "BUY", symbol: "NIFTY 25000 CE", kind: "option" },
    optionChainCopyAlgo(),
  );
  assert.equal(copies.length, 1);
  assert.equal(copies[0].copyUserId, user.id);
  const sent = fanOutAdminOrderCopies(
    {
      kind: "option",
      side: "BUY",
      symbol: "NIFTY 25000 CE",
      qty: 65,
      lotSize: 65,
      price: 120,
      brokerId: "dhan",
      option: "CE",
      strike: 25000,
    },
    { symbol: "NIFTY 25000 CE", side: "BUY", qty: 65 },
  );
  assert.equal(sent.copies, 1);
});

test("option chain master-only mapping does not copy", () => {
  const user = liveMappedUser("u-chain-master");
  saveOptionChainMap({ mappingScope: "master", mappedClientIds: [user.id] });
  const copies = memberCopyPayloads(
    { strategy: "", qty: 65, lotSize: 65, side: "BUY", symbol: "NIFTY 25100 CE", kind: "option" },
    optionChainCopyAlgo(),
  );
  assert.deepEqual(copies, []);
  const sent = fanOutAdminOrderCopies(
    {
      kind: "option",
      side: "BUY",
      symbol: "NIFTY 25100 CE",
      qty: 65,
      lotSize: 65,
      brokerId: "dhan",
    },
    { symbol: "NIFTY 25100 CE", side: "BUY", qty: 65 },
  );
  assert.equal(sent.copies, 0);
});

test("desk snapshot exposes the option chain map", () => {
  saveOptionChainMap({ mappingScope: "clients", mappedClientIds: ["u-chain-live"] });
  const snap = snapshot();
  assert.equal(snap.optionChainMap?.mappingScope, "clients");
  assert.equal(Array.isArray(snap.optionChainMap?.mappedClientIds), true);
});
