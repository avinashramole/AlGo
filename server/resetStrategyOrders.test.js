import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-reset-orders-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const { createAlgo, deleteAlgo, placeOrder, setDhanFeed, snapshot, toggleAlgo } = await import("./market.js");
const { recordMemberCopyFill } = await import("./memberDesk.js");

function deskFile() {
  return JSON.parse(fs.readFileSync(process.env.T2S_MEMBER_DESK_FILE, "utf8"));
}

function namedOrders(name) {
  return (snapshot().orders || []).filter((row) => String(row.strategy || "") === name);
}

test("starting a strategy resets its orders on the admin desk and on user accounts", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const restartName = `Restart orders ${stamp}`;
  const keepName = `Keep orders ${stamp}`;
  const userId = `u-reset-${stamp}`;
  const restart = createAlgo({ name: restartName, kind: "indicator", runMode: "paper", symbol: "NIFTY" });
  const keep = createAlgo({ name: keepName, kind: "indicator", runMode: "paper", symbol: "NIFTY" });
  try {
    const first = placeOrder({
      brokerId: "paper",
      symbol: "NIFTY",
      side: "BUY",
      qty: 65,
      price: 100,
      strategy: restartName,
      type: "MARKET",
    });
    assert.equal(first.error, undefined);
    const kept = placeOrder({
      brokerId: "paper",
      symbol: "NIFTY",
      side: "BUY",
      qty: 65,
      price: 100,
      strategy: keepName,
      type: "MARKET",
    });
    assert.equal(kept.error, undefined);
    recordMemberCopyFill({
      userId,
      paper: true,
      payload: { symbol: "NIFTY", side: "BUY", qty: 65, price: 100, strategy: restartName, brokerId: "paper" },
    });
    recordMemberCopyFill({
      userId,
      paper: false,
      live: { status: "PENDING", orderId: `pend-${stamp}` },
      payload: { symbol: "NIFTY", side: "BUY", qty: 65, price: 100, strategy: restartName, brokerId: "paper" },
    });
    recordMemberCopyFill({
      userId,
      paper: true,
      payload: { symbol: "NIFTY", side: "BUY", qty: 65, price: 100, strategy: keepName, brokerId: "paper" },
    });

    const started = toggleAlgo(restart.id, { enabled: true });
    assert.equal(started.enabled, true);
    assert.equal(namedOrders(restartName).length, 0);
    assert.equal(namedOrders(keepName).length, 1);
    let desk = deskFile()[userId];
    const memberRows = [...(desk.orders || []), ...(desk.orderHistory || [])];
    assert.equal(memberRows.filter((row) => row.strategy === restartName).length, 0);
    assert.equal(memberRows.filter((row) => row.strategy === keepName).length, 1);
    assert.ok((desk.positions || []).some((row) => row.strategy === restartName));

    const again = placeOrder({
      brokerId: "paper",
      symbol: "NIFTY",
      side: "BUY",
      qty: 65,
      price: 110,
      strategy: restartName,
      type: "MARKET",
    });
    assert.equal(again.error, undefined);
    recordMemberCopyFill({
      userId,
      paper: true,
      payload: { symbol: "NIFTY", side: "BUY", qty: 65, price: 110, strategy: restartName, brokerId: "paper" },
    });
    const stopped = toggleAlgo(restart.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    assert.equal(namedOrders(restartName).length, 1);

    const restarted = toggleAlgo(restart.id, { enabled: true });
    assert.equal(restarted.enabled, true);
    assert.equal(namedOrders(restartName).length, 0);
    assert.equal(namedOrders(keepName).length, 1);
    desk = deskFile()[userId];
    const after = [...(desk.orders || []), ...(desk.orderHistory || [])];
    assert.equal(after.filter((row) => row.strategy === restartName).length, 0);
    assert.equal(after.filter((row) => row.strategy === keepName).length, 1);
    assert.ok((desk.positions || []).some((row) => row.strategy === restartName));
  } finally {
    deleteAlgo(restart.id);
    deleteAlgo(keep.id);
    setDhanFeed({ live: false });
  }
});
