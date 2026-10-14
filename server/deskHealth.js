export function deskHealthPayload({ dhanLive = false } = {}) {
  return {
    ok: true,
    service: "t2s",
    time: new Date().toISOString(),
    dhanLive: Boolean(dhanLive),
  };
}

export async function probeDeskHealth({
  url = process.env.T2S_DESK_HEALTH_URL || "http://127.0.0.1:4000/api/desk-health",
  timeoutMs = 800,
  fetchImpl = fetch,
} = {}) {
  const wait = Number(timeoutMs);
  const ctrl = typeof AbortController === "function" ? new AbortController() : null;
  const timer =
    ctrl && Number.isFinite(wait) && wait > 0
      ? setTimeout(() => {
          try {
            ctrl.abort();
          } catch {
            /* ignore */
          }
        }, wait)
      : null;
  try {
    const res = await fetchImpl(url, ctrl ? { signal: ctrl.signal } : {});
    const body = await res.json().catch(() => ({}));
    return { ok: Boolean(res.ok && body?.ok), service: String(body?.service || ""), status: res.status };
  } catch {
    return { ok: false, service: "", status: 0 };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
