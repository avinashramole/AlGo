const CACHE_MS = 9000;
const cache = new Map();
const inflight = new Map();

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function finite(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstFinite(row, keys) {
  for (const key of keys) {
    const n = finite(row?.[key]);
    if (n != null) return n;
  }
  return null;
}

export function positionRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.positions)) return raw.positions;
  if (
    raw &&
    typeof raw === "object" &&
    (raw.realizedProfit != null ||
      raw.unrealizedProfit != null ||
      raw.realised != null ||
      raw.unrealised != null)
  ) {
    return [raw];
  }
  return null;
}

function sumRows(rows, realizedKeys, unrealizedKeys, source) {
  if (!rows) return null;
  if (!rows.length) {
    return { realizedPnl: 0, unrealizedPnl: 0, source, empty: true };
  }
  let realized = 0;
  let unrealized = 0;
  let saw = false;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const realizedLeg = firstFinite(row, realizedKeys);
    const unrealizedLeg = firstFinite(row, unrealizedKeys);
    if (realizedLeg == null && unrealizedLeg == null) continue;
    saw = true;
    realized += realizedLeg || 0;
    unrealized += unrealizedLeg || 0;
  }
  if (!saw) return null;
  return {
    realizedPnl: round2(realized),
    unrealizedPnl: round2(unrealized),
    source,
    empty: false,
  };
}

export function brokerPnlFromDhanRows(raw) {
  return sumRows(
    positionRows(raw),
    ["realizedProfit", "realized_profit", "realised"],
    ["unrealizedProfit", "unrealized_profit", "unrealised"],
    "dhan",
  );
}

export function brokerPnlFromUpstoxRows(raw) {
  return sumRows(
    positionRows(raw),
    ["realised", "realized", "realizedProfit"],
    ["unrealised", "unrealized", "unrealizedProfit"],
    "upstox",
  );
}

export function applyBrokerPnl(desk, pnl) {
  if (!desk || !pnl) return desk;
  const realized = round2(pnl.realizedPnl);
  const unrealized = round2(pnl.unrealizedPnl);
  const gross = round2(realized + unrealized);
  const report = desk.report && typeof desk.report === "object" ? desk.report : {};
  desk.report = {
    ...report,
    realizedPnl: realized,
    unrealizedPnl: unrealized,
    grossPnl: gross,
    charges: 0,
    netPnl: gross,
    brokerPnl: true,
    brokerPnlSource: pnl.source || "",
  };
  const balance = round2(desk.wallet?.balance || 0);
  desk.wallet = {
    ...(desk.wallet || {}),
    balance,
    mtm: unrealized,
    equity: round2(balance + unrealized),
  };
  return desk;
}

async function memberBrokerCredentials(userId) {
  const { brokerAccountForLiveCopy, peekClientSecrets } = await import("./memberDesk.js");
  const desk = peekClientSecrets(userId);
  const brokerId = String(desk.brokerId || "").trim().toLowerCase();
  if (brokerId !== "dhan" && brokerId !== "upstox") return null;
  const slot = brokerAccountForLiveCopy(userId, brokerId);
  if (slot.leftoverToken) return null;
  const token = String(slot.brokerToken || desk.brokerToken || "").trim();
  const clientId = String(slot.accountId || desk.accountId || "").trim();
  if (!token) return null;
  if (brokerId === "dhan" && !clientId) return null;
  return { brokerId, token, clientId };
}

async function upstoxPositions(token) {
  const { ipv4Request } = await import("./ipv4.js");
  const res = await ipv4Request("https://api.upstox.com/v2/portfolio/short-term-positions", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    timeoutMs: 8000,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const message = json?.errors?.[0]?.message || json?.message || `Upstox positions ${res.status}`;
    throw new Error(message);
  }
  const status = String(json?.status || "").toLowerCase();
  if (status && status !== "success") {
    throw new Error(json?.errors?.[0]?.message || "Upstox positions failed");
  }
  return json;
}

async function fetchBrokerPnl(userId) {
  const creds = await memberBrokerCredentials(userId);
  if (!creds) return null;
  if (creds.brokerId === "dhan") {
    const { fetchMemberDhanPositions } = await import("./dhan.js");
    return brokerPnlFromDhanRows(await fetchMemberDhanPositions(creds.token, creds.clientId));
  }
  return brokerPnlFromUpstoxRows(await upstoxPositions(creds.token));
}

export async function readMemberBrokerPnl(userId) {
  const key = String(userId || "").trim();
  if (!key) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  if (inflight.has(key)) return inflight.get(key);
  const job = fetchBrokerPnl(key)
    .then((value) => {
      cache.set(key, { at: Date.now(), value: value || null });
      if (value) {
        console.log(`member broker pnl ${key} ${value.source} realized ${value.realizedPnl} mtm ${value.unrealizedPnl}`);
      }
      return value || null;
    })
    .catch((error) => {
      cache.set(key, { at: Date.now(), value: null });
      console.log(`member broker pnl kept local ${key}: ${error?.message || error}`);
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);
  return job;
}

export async function attachMemberBrokerPnl(desk, userId, load = readMemberBrokerPnl) {
  if (!desk || !userId) return desk;
  try {
    const pnl = await load(userId);
    if (pnl) applyBrokerPnl(desk, pnl);
  } catch (error) {
    console.log(`member broker pnl kept local ${userId}: ${error?.message || error}`);
  }
  return desk;
}
