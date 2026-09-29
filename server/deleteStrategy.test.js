import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-delete-strategy-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");
process.env.T2S_MEMBER_DESK_FILE = path.join(dir, "member-desk.json");
process.env.T2S_PAYMENTS_FILE = path.join(dir, "payments.json");
process.env.T2S_ENROLL_FILE = path.join(dir, "enrollments.json");
process.env.T2S_BROKER_SESSIONS_FILE = path.join(dir, "broker-sessions.json");

const { createAlgo, deleteAlgo, listAlgos, withoutStrategyRows } = await import("./market.js");
const { enrollStrategy, listEnrollments, markEnrollmentPaid, savePaymentSettings } = await import("./subscriptions.js");
const { installMemberBroker, peekClientSecrets, recordMemberCopyFill, saveClientSettings } = await import("./memberDesk.js");

test("deleting a strategy removes its admin book, user book, and member plan", () => {
  const stamp = Date.now();
  const goneName = `Delete Me ${stamp}`;
  const keepName = `Keep Me ${stamp}`;
  const gone = createAlgo({ name: goneName, kind: "indicator", runMode: "live", symbol: "NIFTY" });
  const keep = createAlgo({ name: keepName, kind: "indicator", runMode: "live", symbol: "NIFTY" });
  const member = { id: `u-del-${stamp}`, name: "Delete Member", email: "deletemember@t2s.app", role: "user" };
  const admin = { id: "admin", name: "Admin", email: "trades2smart@gmail.com", role: "admin" };

  savePaymentSettings({ mobile: "9876543210", amount: 999, payeeName: "Trade2Smart", upiId: "9876543210@ybl" });
  const enrolled = enrollStrategy({ user: member, algo: gone, channel: "gpay", term: "monthly" });
  markEnrollmentPaid({ user: admin, enrollmentId: enrolled.enrollment.id });
  const other = enrollStrategy({ user: member, algo: keep, channel: "gpay", term: "monthly" });
  markEnrollmentPaid({ user: admin, enrollmentId: other.enrollment.id });

  installMemberBroker({
    user: member,
    brokerId: "dhan",
    clientId: "11007701",
    accessToken: "member-token-must-stay",
  });
  saveClientSettings(member.id, { mappedStrategy: goneName, brokerId: "dhan" });
  recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24600 CE", side: "BUY", qty: 65, price: 40, strategy: goneName, brokerId: "dhan" },
    paper: true,
  });
  recordMemberCopyFill({
    userId: member.id,
    payload: { symbol: "NIFTY 24700 CE", side: "BUY", qty: 65, price: 41, strategy: keepName, brokerId: "dhan" },
    paper: true,
  });

  const adminBook = withoutStrategyRows(
    [
      { strategy: goneName, symbol: "NIFTY 24600 CE" },
      { strategy: keepName, symbol: "NIFTY 24700 CE" },
      { strategyId: gone.id, strategy: "renamed" },
    ],
    { id: gone.id, name: goneName },
  );
  assert.deepEqual(adminBook.map((row) => row.symbol), ["NIFTY 24700 CE"]);

  const result = deleteAlgo(gone.id);
  assert.equal(result.ok, true);
  assert.equal(listAlgos().some((row) => row.id === gone.id), false);
  assert.equal(listAlgos().some((row) => row.id === keep.id), true);

  const plans = listEnrollments({ userId: member.id });
  assert.equal(plans.some((row) => row.strategyId === gone.id), false);
  assert.equal(plans.some((row) => row.strategyId === keep.id), true);

  const secrets = peekClientSecrets(member.id);
  assert.equal(secrets.brokerToken, "member-token-must-stay");
  assert.equal(secrets.mappedStrategy, "");

  const savedDesk = JSON.parse(fs.readFileSync(process.env.T2S_MEMBER_DESK_FILE, "utf8"));
  const memberDesk = savedDesk[member.id];
  assert.equal((memberDesk.positions || []).some((row) => row.strategy === goneName), false);
  assert.equal((memberDesk.orders || []).some((row) => row.strategy === goneName), false);
  assert.equal((memberDesk.alerts || []).some((row) => String(row.strategy || "") === goneName || String(row.text || "").includes(goneName)), false);
  assert.equal((memberDesk.positions || []).some((row) => row.strategy === keepName), true);
  assert.equal(memberDesk.brokerToken || memberDesk.brokerAccounts?.dhan?.brokerToken, "member-token-must-stay");

  deleteAlgo(keep.id);
});
