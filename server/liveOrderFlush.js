export function sendQueuedLiveOrders(queued, { sendAdmin, sendCopy } = {}) {
  const tasks = (Array.isArray(queued) ? queued : []).map((payload) => {
    const brokerId = String(payload?.brokerId || "dhan");
    const send = payload?.copyUserId ? sendCopy : sendAdmin;
    return Promise.resolve()
      .then(() => send(payload))
      .then((value) => ({ ok: true, payload, brokerId, value }))
      .catch((error) => ({ ok: false, payload, brokerId, error }));
  });
  return Promise.all(tasks);
}
