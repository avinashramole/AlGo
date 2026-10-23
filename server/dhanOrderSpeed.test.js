import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dhanRequestKind, resetDhanRequestLanes, waitForDhanSlot } from "./dhan.js";
import { patchOrderAckSnapshot } from "./market.js";

test("Dhan /orders is its own lane, not a quote or chain poll", () => {
  assert.equal(dhanRequestKind("/orders"), "order");
  assert.equal(dhanRequestKind("/orders/123"), "order");
  assert.equal(dhanRequestKind("/optionchain"), "optionchain");
  assert.equal(dhanRequestKind("/marketfeed/quote"), "quote");
  assert.equal(dhanRequestKind("/ip/getIP"), "other");
});

test("Place does not wait for the 3.5s option-chain gap", async () => {
  resetDhanRequestLanes();
  await waitForDhanSlot("optionchain", "admin");
  const t0 = Date.now();
  await waitForDhanSlot("order", "admin");
  assert.ok(Date.now() - t0 < 200, `order waited ${Date.now() - t0}ms behind the chain poll`);
});

test("two mapped Dhan clients send at the same time", async () => {
  resetDhanRequestLanes();
  const started = [];
  const jobs = ["11001", "11002"].map(async (id) => {
    await waitForDhanSlot("order", "member", id);
    started.push(id);
  });
  await Promise.all(jobs);
  assert.deepEqual(started.sort(), ["11001", "11002"]);
});

test("order ACK keeps the last desk snapshot and only refreshes the book", () => {
  const patched = patchOrderAckSnapshot({
    optionChain: [{ strike: 24500 }],
    settings: { broker: "Dhan" },
    orders: [],
    positions: [],
    notifications: [],
  });
  assert.ok(patched);
  assert.equal(patched.settings.broker, "Dhan");
  assert.equal(patched.optionChain[0].strike, 24500);
  assert.ok(Array.isArray(patched.orders));
  assert.ok(Array.isArray(patched.positions));
});

test("POST /api/orders replies after the admin ACK and does not wait for copies", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("./index.js", import.meta.url)), "utf8");
  const start = src.indexOf('app.post("/api/orders"');
  const end = src.indexOf("\napp.", start + 10);
  const handler = src.slice(start, end > start ? end : undefined);
  assert.match(handler, /continueCopySends\(\)/);
  assert.match(handler, /orderAckSnapshot\(\)/);
  assert.doesNotMatch(handler, /await awaitMemberCopySends/);
  assert.doesNotMatch(handler, /await flushLiveAlgoOrders/);
  assert.doesNotMatch(handler, /snapshot\(\)\.orders/);
  assert.doesNotMatch(handler, /snapshot\(\)\.activeBrokerId/);
});

test("placeDhanOrder does not clone the desk before the broker POST", () => {
  const src = fs.readFileSync(fileURLToPath(new URL("./dhan.js", import.meta.url)), "utf8");
  const start = src.indexOf("export async function placeDhanOrder");
  const end = src.indexOf("\nexport async function cancelDhanOrder", start + 10);
  const fn = src.slice(start, end > start ? end : undefined);
  assert.doesNotMatch(fn, /snapshot\(\)/);
  assert.doesNotMatch(fn, /const ipPromise = /);
});
