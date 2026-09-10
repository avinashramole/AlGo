import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-clients-"));
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_MESSAGING_FILE = path.join(dir, "messaging.json");

fs.writeFileSync(
  process.env.T2S_USERS_FILE,
  `${JSON.stringify(
    [
      {
        id: "avinash",
        name: "Avinash",
        email: "demo@t2s.app",
        desk: "Index Options",
        role: "admin",
        password: "demo123",
      },
      {
        id: "u-arpit",
        name: "ARPIT",
        email: "arpit@gmail.com",
        mobile: "9876543210",
        desk: "Index Options",
        role: "user",
        createdAt: "2026-09-09T10:00:00.000Z",
      },
    ],
    null,
    2,
  )}\n`,
);

const { listPublicUsers, loginWithPassword } = await import("./auth.js");
const { saveClientSettings } = await import("./memberDesk.js");
const { asLedgerPosition, clientStatus, createClient, deleteClient, listClients, listPositionDesk, saveClient } = await import("./clients.js");

test("listClients starts members on PAPER with copy off and does not include admins", () => {
  const rows = listClients(listPublicUsers());
  assert.equal(rows.some((row) => row.role === "admin" || row.name === "Avinash"), false);
  const arpit = rows.find((row) => row.id === "u-arpit");
  assert.equal(arpit.brokerName, "PAPER");
  assert.equal(arpit.linked, false);
  assert.equal(arpit.tradeMode, "paper");
  assert.equal(arpit.copy, false);
  assert.equal(arpit.status, "PAPER ONLY");
  assert.equal(arpit.sizingKind, "multiplier");
  assert.equal(arpit.sizingValue, 1);
  assert.equal(arpit.staticIp, "");
  assert.equal(arpit.group, "ALL");
});

test("saveClient can mark REAL without turning Dhan LIVE on", () => {
  const row = saveClient("u-arpit", {
    brokerId: "dhan",
    accountId: "1100223344",
    tradeMode: "real",
    copy: true,
    sizingKind: "multiplier",
    sizingValue: 2,
    staticIp: "136.243.188.130",
    group: "NIFTY",
  });
  assert.equal(row.brokerName, "DHAN");
  assert.equal(row.accountId, "1100223344");
  assert.equal(row.tradeMode, "real");
  assert.equal(row.status, "LIVE");
  assert.equal(row.copy, true);
  assert.equal(row.sizingValue, 2);
  assert.equal(row.staticIp, "136.243.188.130");
  assert.equal(row.group, "NIFTY");
  const desk = saveClientSettings("u-arpit", {});
  assert.equal(desk.tradeMode, "real");
  assert.equal(process.env.DHAN_LIVE, undefined);
});

test("clientStatus counts LIVE vs paper", () => {
  const status = clientStatus(listPublicUsers());
  assert.equal(status.live, 1);
  assert.equal(status.paper, 0);
  assert.equal(status.groups.includes("NIFTY"), true);
});

test("createClient provisions a member who signs in with mobile and 1234", () => {
  const row = createClient({
    name: "Ramesh Kumar",
    mobile: "9123456789",
    email: "ramesh@gmail.com",
    brokerId: "dhan",
    accountId: "master",
    copy: true,
    sizingKind: "multiplier",
    sizingValue: 1,
    tradeMode: "paper",
    subscriptionMode: "copy",
    subscriptionUntil: "2026-10-09",
  });
  assert.equal(row.name, "Ramesh Kumar");
  assert.equal(row.copy, true);
  assert.equal(row.tradeMode, "paper");
  assert.equal(row.status, "PAPER ONLY");
  assert.equal(row.accountId, "master");
  assert.equal(row.subscriptionMode, "copy");
  assert.equal(row.subscriptionUntil, "2026-10-09");
  const session = loginWithPassword("9123456789", "1234");
  assert.equal(session.user.role, "user");
  assert.equal(session.user.mobile, "9123456789");
  assert.equal(process.env.DHAN_LIVE, undefined);
});

test("createClient stores groups, notifications, mapped strategy and hides the access token", () => {
  const row = createClient({
    name: "Upstox Client",
    mobile: "9876500123",
    brokerId: "upstox",
    accountId: "master",
    tradeMode: "paper",
    copy: true,
    groups: ["UPSTOX TESTING", "F&O"],
    mappedStrategy: "NIFTY VWAP ATM",
    segments: ["All segments", "UPSTOX"],
    notifications: { instantAlerts: true, eveningPnl: true, whatsapp: true, telegram: false },
    notes: "Prefers evening report",
    brokerToken: "upstox-secret-token-value",
    subscriptionUntil: "2026-10-09",
  });
  assert.equal(row.brokerName, "UPSTOX");
  assert.deepEqual(row.groups.slice(0, 2), ["UPSTOX TESTING", "F&O"]);
  assert.equal(row.mappedStrategy, "NIFTY VWAP ATM");
  assert.equal(row.notifications.eveningPnl, true);
  assert.equal(row.tokenHint.includes("secret-token-value"), false);
  assert.match(row.tokenHint, /•/);
  assert.equal(row.notes, "Prefers evening report");
});

test("createClient refuses a broker IP already used on that broker", () => {
  saveClient("u-arpit", { brokerId: "dhan", staticIp: "10.1.1.8" });
  assert.throws(
    () =>
      createClient({
        name: "IP Clash",
        mobile: "9876500456",
        brokerId: "dhan",
        tradeMode: "paper",
        staticIp: "10.1.1.8",
      }),
    /egress IP/,
  );
});

test("createClient refuses REAL when no broker is linked", () => {
  assert.throws(
    () => createClient({ name: "No Broker", mobile: "9000000001", brokerId: "paper", tradeMode: "real" }),
    /broker/,
  );
});

test("position desk lists master first and a live ledger per member", () => {
  saveClientSettings("u-arpit", { tradeMode: "paper" });
  const desk = listPositionDesk(
    listPublicUsers(),
    [{ id: "m1", symbol: "NIFTY 24600 CE", type: "BUY", qty: 65, avg: 100, ltp: 110, pnl: 650, product: "MIS", brokerId: "dhan" }],
    [{ pnl: 200 }],
  );
  assert.equal(desk.master.title, "Master");
  assert.equal(desk.master.subtitle, "PRIMARY MASTER ACCOUNT");
  assert.equal(desk.master.open, 1);
  assert.equal(desk.master.positions[0].buyQty, 65);
  assert.equal(desk.master.positions[0].netQty, 65);
  assert.equal(desk.master.positions[0].segment, "indian");
  assert.equal(desk.clients.some((row) => row.name === "Avinash"), false);
  const arpit = desk.clients.find((row) => row.id === "u-arpit");
  assert.equal(arpit.subtitle, "CLIENT ACCOUNT");
  assert.equal(arpit.open, 0);
  assert.equal(desk.openPositions, 1);
  assert.equal(desk.masterMtm, 650);
  const crypto = asLedgerPosition({ symbol: "BTCUSDT", type: "SELL", qty: 1, avg: 100, ltp: 90, pnl: 10 });
  assert.equal(crypto.segment, "crypto");
  assert.equal(crypto.sellQty, 1);
  assert.equal(crypto.netQty, -1);
});

test("position MTM uses marked LTP pnl, so a 96.71 fill is not stuck at send-time 106", () => {
  const row = asLedgerPosition({
    symbol: "NIFTY 23450 PE",
    type: "BUY",
    qty: 65,
    avg: 96.71,
    ltp: 90,
    pnl: Number(((90 - 96.71) * 65).toFixed(2)),
  });
  assert.equal(row.buyPrice, 96.71);
  assert.equal(row.ltp, 90);
  assert.ok(row.mtm < 0);
});

test("deleteClient removes a member and refuses the desk admin", () => {
  assert.throws(() => deleteClient("avinash", { actorId: "segin" }), /admin/);
  const gone = deleteClient("u-arpit", { actorId: "avinash" });
  assert.equal(gone.ok, true);
  assert.equal(listClients(listPublicUsers()).some((row) => row.id === "u-arpit"), false);
});
