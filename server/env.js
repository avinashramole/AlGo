import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.join(__dirname, "..");

export const ENV_FILE_NAMES = [".env", "tokan.env", "token.env", "dhan.env"];

const DHAN_KEYS = ["DHAN_CLIENT_ID", "DHAN_PIN", "DHAN_TOTP_SECRET"];

export function parseEnvText(text) {
  const map = {};
  for (const line of String(text || "").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

export function overlayEnvMaps(mapsOldestFirst) {
  const merged = {};
  for (const map of mapsOldestFirst || []) {
    if (!map || typeof map !== "object") continue;
    for (const [key, value] of Object.entries(map)) {
      if (String(value || "").trim() !== "") merged[key] = String(value);
    }
  }
  return merged;
}

function envPaths(root = REPO_ROOT) {
  const files = ENV_FILE_NAMES.map((name) => path.join(root, name));
  if (root === REPO_ROOT) files.unshift(path.join(__dirname, ".env"));
  return files;
}

function readEnvFile(file) {
  try {
    const st = fs.statSync(file);
    return { file, mtimeMs: st.mtimeMs, map: parseEnvText(fs.readFileSync(file, "utf8")) };
  } catch {
    return null;
  }
}

export function loadDotEnvFiles({ root = REPO_ROOT, env = process.env } = {}) {
  const parsed = envPaths(root)
    .map(readEnvFile)
    .filter(Boolean)
    .sort((a, b) => a.mtimeMs - b.mtimeMs);
  const merged = overlayEnvMaps(parsed.map((item) => item.map));
  for (const [key, value] of Object.entries(merged)) {
    env[key] = value;
  }
  return merged;
}

function serializeEnvMap(map) {
  const order = [
    "DHAN_CLIENT_ID",
    "DHAN_PIN",
    "DHAN_TOTP_SECRET",
    "DHAN_ACCESS_TOKEN",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "PUBLIC_URL",
    "PORT",
  ];
  const lines = [];
  const seen = new Set();
  for (const key of order) {
    const value = map[key];
    if (value == null || String(value).trim() === "") continue;
    lines.push(`${key}=${value}`);
    seen.add(key);
  }
  for (const key of Object.keys(map).sort()) {
    if (seen.has(key) || map[key] == null || String(map[key]).trim() === "") continue;
    lines.push(`${key}=${map[key]}`);
  }
  return `${lines.join("\n")}\n`;
}

export function upsertDhanEnv(patch = {}, { root = REPO_ROOT, env = process.env } = {}) {
  const updates = {};
  if (patch.DHAN_CLIENT_ID || patch.clientId) updates.DHAN_CLIENT_ID = String(patch.DHAN_CLIENT_ID || patch.clientId || "").trim();
  if (patch.DHAN_PIN || patch.pin) updates.DHAN_PIN = String(patch.DHAN_PIN || patch.pin || "").trim();
  if (patch.DHAN_TOTP_SECRET || patch.totpSecret) {
    updates.DHAN_TOTP_SECRET = String(patch.DHAN_TOTP_SECRET || patch.totpSecret || "").trim();
  }
  const targets = [path.join(root, ".env"), path.join(root, "tokan.env")];
  for (const file of targets) {
    const current = readEnvFile(file)?.map || {};
    const next = { ...current, ...updates };
    fs.writeFileSync(file, serializeEnvMap(next), { mode: 0o600 });
    try {
      fs.chmodSync(file, 0o600);
    } catch {
      /* windows */
    }
  }
  for (const key of DHAN_KEYS) {
    if (updates[key]) env[key] = updates[key];
  }
  return updates;
}
