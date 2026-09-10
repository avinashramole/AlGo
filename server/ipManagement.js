import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { getPublicUser } from "./auth.js";
import { CLIENT_BROKERS, isStaticIp, listDeskRecords, saveClientSettings } from "./memberDesk.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IPS_FILE = process.env.T2S_EGRESS_IPS_FILE || path.join(__dirname, "data", "egress-ips.json");
export const MAX_BROKER_SLOTS = 14;

export const EGRESS_BROKER_SLOTS = [
  { id: "upstox", name: "UPSTOX", color: "#5b2d8e" },
  { id: "aliceblue", name: "ALICEBLUE", color: "#1d4ed8" },
  { id: "angelone", name: "ANGELONE", color: "#c2410c" },
  { id: "dhan", name: "DHAN", color: "#0f9d58" },
  { id: "kotak", name: "KOTAK", color: "#0033a0" },
  { id: "sharekhan", name: "SHAREKHAN", color: "#0f766e" },
  { id: "zerodha", name: "ZERODHA", color: "#f6461a" },
  { id: "groww", name: "GROWW", color: "#00b386" },
  { id: "incred", name: "INCRED", color: "#e11d48" },
  { id: "motilal", name: "MOTILAL", color: "#1e3a8a" },
  { id: "choice", name: "CHOICE", color: "#7c3aed" },
  { id: "delta", name: "DELTA", color: "#0891b2" },
  { id: "coindcx", name: "COINDCX", color: "#2563eb" },
  { id: "binance", name: "BINANCE", color: "#f59e0b" },
];

const DEFAULT_INVENTORY = [
  { address: "136.243.168.130", family: "ipv4", label: "Quantity" },
  { address: "136.243.168.131", family: "ipv4", label: "Quantity" },
  { address: "136.243.168.132", family: "ipv4", label: "Quantity" },
  { address: "144.76.26.61", family: "ipv4", label: "Hetzner Cloud" },
];

function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function ipFamily(address) {
  return String(address || "").includes(":") ? "ipv6" : "ipv4";
}

function normalizeAddress(value) {
  return String(value || "").trim();
}

function readStore() {
  try {
    const row = JSON.parse(fs.readFileSync(IPS_FILE, "utf8"));
    if (row && Array.isArray(row.ips)) return { ips: row.ips };
  } catch {
    /* first boot */
  }
  return { ips: DEFAULT_INVENTORY.map((row) => ({ ...row, lastTestAt: "", lastTestOk: false, lastTestError: "", lastTestSeen: "" })) };
}

function writeStore(next) {
  fs.mkdirSync(path.dirname(IPS_FILE), { recursive: true });
  fs.writeFileSync(IPS_FILE, `${JSON.stringify(next, null, 2)}\n`);
}

let store = readStore();

function persist() {
  writeStore(store);
}

function asInventoryRow(row = {}) {
  const address = normalizeAddress(row.address);
  return {
    address,
    family: row.family === "ipv6" || address.includes(":") ? "ipv6" : "ipv4",
    label: String(row.label || "").trim() || (address.includes(":") ? "IPv6" : "IPv4"),
    lastTestAt: String(row.lastTestAt || ""),
    lastTestOk: Boolean(row.lastTestOk),
    lastTestError: String(row.lastTestError || ""),
    lastTestSeen: String(row.lastTestSeen || ""),
  };
}

function brokerMeta(id) {
  return (
    EGRESS_BROKER_SLOTS.find((row) => row.id === id) ||
    CLIENT_BROKERS.find((row) => row.id === id) || { id, name: String(id || "").toUpperCase(), color: "#64748b" }
  );
}

export function inventoryAddresses() {
  return [...new Set(store.ips.map((row) => normalizeAddress(row.address)).filter(Boolean))];
}

function assignmentsFor(address) {
  const ip = normalizeAddress(address);
  return listDeskRecords()
    .filter((desk) => normalizeAddress(desk.staticIp) === ip && desk.brokerId && desk.brokerId !== "paper")
    .map((desk) => {
      const user = getPublicUser(desk.userId) || {};
      const broker = brokerMeta(desk.brokerId);
      return {
        userId: desk.userId,
        name: user.name || desk.userId,
        brokerId: desk.brokerId,
        brokerName: broker.name,
        brokerColor: broker.color,
        accountId: desk.accountId || "",
      };
    })
    .sort((a, b) => String(a.brokerName).localeCompare(String(b.brokerName)));
}

function cardFor(row) {
  const assigned = assignmentsFor(row.address);
  const usedIds = [...new Set(assigned.map((item) => item.brokerId))];
  const available = EGRESS_BROKER_SLOTS.filter((slot) => !usedIds.includes(slot.id));
  const status = row.lastTestOk ? "healthy" : row.lastTestAt ? "failed" : "untested";
  return {
    ...asInventoryRow(row),
    status,
    assignedCount: assigned.length,
    slotsUsed: usedIds.length,
    slotsMax: MAX_BROKER_SLOTS,
    assigned,
    availableSlots: available,
  };
}

export function ipManagementStatus() {
  if (!fs.existsSync(IPS_FILE) && store.ips.length) persist();
  const assignedIps = new Set(
    listDeskRecords()
      .map((desk) => normalizeAddress(desk.staticIp))
      .filter(Boolean),
  );
  for (const ip of assignedIps) {
    if (!store.ips.some((row) => normalizeAddress(row.address) === ip)) {
      store.ips.push(asInventoryRow({ address: ip, label: ipFamily(ip) === "ipv6" ? "IPv6" : "IPv4" }));
      persist();
    }
  }
  const cards = store.ips.map(cardFor);
  const desks = listDeskRecords();
  const withoutIp = desks.filter((desk) => !normalizeAddress(desk.staticIp)).length;
  const brokersCovered = new Set(cards.flatMap((card) => card.assigned.map((row) => row.brokerId))).size;
  return {
    family: "all",
    slots: EGRESS_BROKER_SLOTS,
    stats: {
      ipv4: cards.filter((row) => row.family === "ipv4").length,
      ipv6: cards.filter((row) => row.family === "ipv6").length,
      healthy: cards.filter((row) => row.status === "healthy").length,
      assignments: cards.reduce((sum, row) => sum + row.assignedCount, 0),
      brokersCovered,
      serverDefault: withoutIp,
    },
    ips: cards,
    unassigned: desks
      .filter((desk) => !normalizeAddress(desk.staticIp))
      .map((desk) => {
        const user = getPublicUser(desk.userId) || {};
        const broker = brokerMeta(desk.brokerId);
        return {
          userId: desk.userId,
          name: user.name || desk.userId,
          brokerId: desk.brokerId,
          brokerName: broker.name,
          accountId: desk.accountId || "",
        };
      }),
  };
}

export function addStaticIp({ address, label } = {}) {
  const ip = normalizeAddress(address);
  if (!ip || ip.toLowerCase() === "default" || !isStaticIp(ip)) {
    throw fail("Enter a valid IPv4 or IPv6 address.");
  }
  if (ip.toLowerCase() === "default") throw fail("Enter a valid IPv4 or IPv6 address.");
  const looksAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || ip.includes(":");
  if (!looksAddress) throw fail("Enter a valid IPv4 or IPv6 address.");
  if (store.ips.some((row) => normalizeAddress(row.address) === ip)) throw fail("That static IP is already in inventory.");
  store.ips.push(
    asInventoryRow({
      address: ip,
      family: ipFamily(ip),
      label: String(label || "").trim() || (ipFamily(ip) === "ipv6" ? "IPv6" : "IPv4"),
    }),
  );
  persist();
  return ipManagementStatus();
}

export function removeStaticIp(address) {
  const ip = normalizeAddress(address);
  const assigned = assignmentsFor(ip);
  if (assigned.length) throw fail("Unassign every account from this IP before deleting it.");
  const next = store.ips.filter((row) => normalizeAddress(row.address) !== ip);
  if (next.length === store.ips.length) throw fail("Static IP not found.", 404);
  store.ips = next;
  persist();
  return ipManagementStatus();
}

export function assignStaticIp({ address, userId, brokerId } = {}) {
  const ip = normalizeAddress(address);
  if (!store.ips.some((row) => normalizeAddress(row.address) === ip)) {
    throw fail("Add the static IP to inventory first.");
  }
  const used = new Set(assignmentsFor(ip).map((row) => row.brokerId));
  const nextBroker = String(brokerId || "").trim().toLowerCase();
  if (nextBroker && !used.has(nextBroker) && used.size >= MAX_BROKER_SLOTS) {
    throw fail(`This IP already uses all ${MAX_BROKER_SLOTS} broker slots.`);
  }
  saveClientSettings(userId, { staticIp: ip, ...(nextBroker ? { brokerId: nextBroker } : {}) });
  return ipManagementStatus();
}

export function unassignStaticIp({ userId } = {}) {
  saveClientSettings(userId, { staticIp: "" });
  return ipManagementStatus();
}

export async function probeEgressBind(address) {
  const ip = normalizeAddress(address);
  const args = ["--interface", ip, "--max-time", "8", "-sS", ip.includes(":") ? "https://api64.ipify.org" : "https://api.ipify.org"];
  try {
    const { stdout } = await execFileAsync("curl", args, { timeout: 12_000 });
    const seen = String(stdout || "").trim();
    const ok = Boolean(seen) && (seen === ip || ip.includes(":"));
    return { ok, seen, error: ok ? "" : `Bind returned ${seen || "nothing"}` };
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "bind test failed");
    return { ok: false, seen: "", error: detail.slice(0, 240) };
  }
}

export async function testStaticIp(address) {
  const ip = normalizeAddress(address);
  const row = store.ips.find((item) => normalizeAddress(item.address) === ip);
  if (!row) throw fail("Static IP not found.", 404);
  const result = await probeEgressBind(ip);
  row.lastTestAt = new Date().toISOString();
  row.lastTestOk = Boolean(result.ok);
  row.lastTestSeen = result.seen || "";
  row.lastTestError = result.error || "";
  persist();
  return { ...ipManagementStatus(), test: result };
}
