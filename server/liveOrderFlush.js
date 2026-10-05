const COPY_SEND_CONCURRENCY = 2;
const COPY_RETRY_ATTEMPTS = 3;

export function isRetryableCopyError(error) {
  if (!error) return false;
  if (error.rateLimit || Number(error.status) === 429) return true;
  return /429|rate limit|too many requests/i.test(String(error.message || error));
}

function runSend(payload, { sendAdmin, sendCopy }) {
  const brokerId = String(payload?.brokerId || "dhan");
  const send = payload?.copyUserId ? sendCopy : sendAdmin;
  return Promise.resolve()
    .then(() => send(payload))
    .then((value) => ({ ok: true, payload, brokerId, value }))
    .catch((error) => ({ ok: false, payload, brokerId, error }));
}

async function sendCopyWithRetry(payload, hooks) {
  let last = null;
  for (let attempt = 0; attempt < COPY_RETRY_ATTEMPTS; attempt += 1) {
    last = await runSend(payload, hooks);
    if (last.ok || !isRetryableCopyError(last.error) || attempt === COPY_RETRY_ATTEMPTS - 1) return last;
    const wait = Math.min(8_000, Number(last.error?.retryAfterMs) || 1_500 * 2 ** attempt);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  return last;
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function pump() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  const n = Math.max(1, Math.min(limit, items.length) || 1);
  await Promise.all(Array.from({ length: n }, () => pump()));
  return results;
}

export async function sendQueuedLiveOrders(queued, hooks = {}) {
  const rows = Array.isArray(queued) ? queued : [];
  const admins = rows.filter((payload) => !payload?.copyUserId);
  const copies = rows.filter((payload) => payload?.copyUserId);
  const adminJobs = admins.map((payload) => runSend(payload, hooks));
  const copyJobs = mapPool(copies, COPY_SEND_CONCURRENCY, (payload) => sendCopyWithRetry(payload, hooks));
  const [adminResults, copyResults] = await Promise.all([Promise.all(adminJobs), copyJobs]);
  const byPayload = new Map();
  for (const row of [...adminResults, ...copyResults]) byPayload.set(row.payload, row);
  return rows.map((payload) => byPayload.get(payload)).filter(Boolean);
}
