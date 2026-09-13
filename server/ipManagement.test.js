import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-ips-"));
process.env.T2S_USERS_FILE = path.join(dir, "users.json");
process.env.T2S_SESSIONS_FILE = path.join(dir, "sessions.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_EGRESS_IPS_FILE = path.join(dir, "egress-ips.json");

fs.writeFileSync(
  process.env.T2S_USERS_FILE,
  `${JSON.stringify(
    [
      { id: "avinash", name: "Avinash", email: "demo@t2s.app", role: "admin", password: "demo123" },
      { id: "u-arpit", name: "ARPIT", email: "arpit@gmail.com", role: "user" },
      { id: "u-sunita", name: "sunita", email: "sunita@gmail.com", role: "user" },
    ],
    null,
    2,
  )}\n`,
);
fs.writeFileSync(process.env.T2S_EGRESS_IPS_FILE, `${JSON.stringify({ ips: [] }, null, 2)}\n`);

const { saveClientSettings, peekClientSettings } = await import("./memberDesk.js");
const { addStaticIp, assignStaticIp, ipManagementStatus, MAX_BROKER_SLOTS, removeStaticIp, unassignStaticIp } = await import(
  "./ipManagement.js"
);

test("empty inventory can add an IPv4 and lists 14 broker slots", () => {
  const status = addStaticIp({ address: "136.243.168.130", label: "Quantity" });
  assert.equal(status.stats.ipv4, 1);
  assert.equal(status.ips[0].address, "136.243.168.130");
  assert.equal(status.ips[0].status, "untested");
  assert.equal(status.ips[0].slotsMax, MAX_BROKER_SLOTS);
  assert.equal(status.ips[0].availableSlots.length, 14);
  assert.equal(status.slots.length, 14);
});

test("same IP cannot be added twice", () => {
  assert.throws(() => addStaticIp({ address: "136.243.168.130" }), /already/);
});

test("assigning a client fills a broker slot and unassign returns to server default", () => {
  saveClientSettings("u-arpit", { brokerId: "sharekhan", accountId: "child-420008" });
  const assigned = assignStaticIp({ address: "136.243.168.130", userId: "u-arpit", brokerId: "sharekhan" });
  assert.equal(assigned.stats.assignments, 1);
  assert.equal(assigned.ips[0].assigned[0].name, "ARPIT");
  assert.equal(assigned.ips[0].assigned[0].brokerName, "SHAREKHAN");
  assert.equal(assigned.ips[0].slotsUsed, 1);
  assert.equal(assigned.stats.brokersCovered, 1);
  const freed = unassignStaticIp({ userId: "u-arpit" });
  assert.equal(freed.stats.assignments, 0);
  assert.equal(peekClientSettings("u-arpit").brokerId, "sharekhan");
  assert.equal(peekClientSettings("u-arpit").staticIp, "");
  assert.ok(freed.stats.serverDefault >= 1);
});

test("one broker cannot share the same egress IP across two accounts", () => {
  assignStaticIp({ address: "136.243.168.130", userId: "u-arpit", brokerId: "dhan" });
  saveClientSettings("u-sunita", { brokerId: "dhan", accountId: "child-9" });
  assert.throws(() => assignStaticIp({ address: "136.243.168.130", userId: "u-sunita", brokerId: "dhan" }), /egress IP/);
});

test("a second broker can share the same IP and delete is blocked while assigned", () => {
  const next = assignStaticIp({ address: "136.243.168.130", userId: "u-sunita", brokerId: "choice" });
  assert.equal(next.ips[0].assigned.length, 2);
  assert.equal(next.ips[0].slotsUsed, 2);
  assert.throws(() => removeStaticIp("136.243.168.130"), /Unassign/);
  unassignStaticIp({ userId: "u-arpit" });
  unassignStaticIp({ userId: "u-sunita" });
  const gone = removeStaticIp("136.243.168.130");
  assert.equal(gone.ips.some((row) => row.address === "136.243.168.130"), false);
});

test("IPv6 inventory is counted separately from IPv4", () => {
  addStaticIp({ address: "2001:db8::1", label: "v6" });
  const status = ipManagementStatus();
  assert.equal(status.stats.ipv6, 1);
  assert.equal(status.ips.find((row) => row.address === "2001:db8::1").family, "ipv6");
});

test("accounts table lists every member with assigned IP or server default", () => {
  addStaticIp({ address: "136.243.168.130", label: "Quantity" });
  saveClientSettings("u-arpit", { brokerId: "sharekhan", accountId: "4212081", copy: true });
  const assigned = assignStaticIp({ address: "136.243.168.130", userId: "u-arpit", brokerId: "sharekhan" });
  const arpit = assigned.accounts.find((row) => row.userId === "u-arpit");
  assert.equal(arpit.name, "ARPIT");
  assert.equal(arpit.kind, "child");
  assert.equal(arpit.brokerName, "SHAREKHAN");
  assert.equal(arpit.accountId, "4212081");
  assert.equal(arpit.staticIp, "136.243.168.130");
  assert.equal(arpit.status, "active");
  assert.equal(
    assigned.accounts.some((row) => row.userId === "avinash"),
    false,
  );
  const sunita = assigned.accounts.find((row) => row.userId === "u-sunita");
  assert.equal(sunita.staticIp, "");
  assert.equal(sunita.status, "inactive");
  const freed = unassignStaticIp({ userId: "u-arpit" });
  assert.equal(freed.accounts.find((row) => row.userId === "u-arpit").staticIp, "");
});
