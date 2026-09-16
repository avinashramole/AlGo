import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "t2s-toggle-"));
process.env.T2S_ALGOS_FILE = path.join(dir, "algos.json");

const { createAlgo, deleteAlgo, listAlgos, setDhanFeed, toggleAlgo } = await import("./market.js");

function names(...rows) {
  return rows.map((row) => row.name);
}

test("starting one strategy does not stop another, and a second start click stays LIVE", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const first = createAlgo({ name: `Toggle One ${stamp}`, kind: "indicator", runMode: "live" });
  const second = createAlgo({ name: `Toggle Two ${stamp}`, kind: "indicator", runMode: "live" });
  try {
    const startedFirst = toggleAlgo(first.id, { enabled: true });
    const startedSecond = toggleAlgo(second.id, { enabled: true });
    assert.equal(startedFirst.enabled, true);
    assert.equal(startedFirst.status, "LIVE");
    assert.equal(startedSecond.enabled, true);
    assert.equal(startedSecond.status, "LIVE");

    const again = toggleAlgo(first.id, { enabled: true });
    assert.equal(again.enabled, true);
    assert.equal(again.status, "LIVE");

    const live = listAlgos();
    assert.equal(live.find((row) => row.id === first.id).enabled, true);
    assert.equal(live.find((row) => row.id === second.id).enabled, true);

    const third = createAlgo({ name: `Toggle Three ${stamp}`, kind: "indicator", runMode: "live" });
    const startedThird = toggleAlgo(third.id, { enabled: true });
    assert.equal(startedThird.enabled, true);
    assert.equal(listAlgos().find((row) => row.id === first.id).enabled, true);
    assert.equal(listAlgos().find((row) => row.id === second.id).enabled, true);

    const stopped = toggleAlgo(first.id, { enabled: false });
    assert.equal(stopped.enabled, false);
    assert.equal(stopped.status, "PAUSED");
    assert.equal(listAlgos().find((row) => row.id === second.id).enabled, true);
    assert.equal(listAlgos().find((row) => row.id === third.id).enabled, true);
  } finally {
    for (const row of listAlgos().filter((item) => item.name.includes(String(stamp)))) {
      deleteAlgo(row.id);
    }
    setDhanFeed({ live: false });
    assert.equal(names(...listAlgos().filter((row) => row.name.includes(String(stamp)))).length, 0);
  }
});

test("all live strategies can start at the same time", () => {
  setDhanFeed({ live: true });
  const stamp = Date.now();
  const created = ["A", "B", "C", "D"].map((label) =>
    createAlgo({ name: `StartAll ${label} ${stamp}`, kind: "indicator", runMode: "live" }),
  );
  try {
    const started = created.map((row) => toggleAlgo(row.id, { enabled: true }));
    assert.equal(started.every((row) => row.enabled === true && row.status === "LIVE"), true);
    const live = listAlgos();
    for (const row of created) {
      assert.equal(live.find((item) => item.id === row.id).enabled, true);
      assert.equal(live.find((item) => item.id === row.id).status, "LIVE");
    }
  } finally {
    for (const row of listAlgos().filter((item) => item.name.includes(String(stamp)))) {
      deleteAlgo(row.id);
    }
    setDhanFeed({ live: false });
  }
});
