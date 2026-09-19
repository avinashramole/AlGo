export function isMemberScopedOrder(payload = {}) {
  return Boolean(
    payload.copyUserId ||
      (payload.account && typeof payload.account === "object") ||
      (payload.brokerSession && typeof payload.brokerSession === "object"),
  );
}

export function adminLiveOrderPayload(payload = {}) {
  const next = { ...payload };
  delete next.account;
  delete next.brokerSession;
  delete next.copyUserId;
  return next;
}

function fail(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function dhanOrderCredentials(payload = {}, desk = {}) {
  if (isMemberScopedOrder(payload)) {
    const account = payload.account && typeof payload.account === "object" ? payload.account : null;
    const token = String(account?.accessToken || "").trim();
    const clientId = String(account?.clientId || "").trim();
    if (!token || !clientId) {
      throw fail("This member has no Dhan Client ID + Access Token. Install them on My plan.");
    }
    return { lane: "member", token, clientId, account };
  }
  const token = String(desk.accessToken || "").trim();
  const clientId = String(desk.clientId || "").trim();
  if (!token || !clientId) {
    throw fail("Dhan live is off. Open Brokers and paste Client ID + Access Token.");
  }
  return { lane: "admin", token, clientId, account: null };
}

export function credentialHint(value) {
  const raw = String(value || "").trim();
  if (!raw) return "not set";
  return raw.length >= 4 ? `••••${raw.slice(-4)}` : "set";
}

export function annotateMemberLiveAuthError(error, session = {}, { brokerName = "broker" } = {}) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || "broker error");
  if (/used this member's/.test(message)) return error instanceof Error ? error : new Error(message);
  if (status !== 401 && !/unauthorized|invalid.?token|expired.?token|\b401\b/i.test(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  const clientId = String(session.clientId || "").trim();
  const who = clientId ? `client ID ${clientId}` : "no client ID";
  const next = new Error(
    `${message}. ${brokerName} used this member's ${who} and access token ${credentialHint(session.accessToken)} — not the admin login. Paste a fresh daily ${brokerName} token on My plan if it expired.`,
  );
  next.status = 401;
  return next;
}

export function liveOrderSession(payload = {}, adminSession = null, { brokerName = "broker" } = {}) {
  const override = payload.brokerSession && typeof payload.brokerSession === "object" ? payload.brokerSession : null;
  const account = payload.account && typeof payload.account === "object" ? payload.account : null;
  if (isMemberScopedOrder(payload)) {
    const leftover = Boolean(payload.leftoverSlot || override?.leftoverSlot || account?.leftoverSlot);
    const session = {
      accessToken: String(override?.accessToken || account?.accessToken || "").trim(),
      apiKey: String(override?.apiKey || account?.apiKey || "").trim(),
      clientId: String(override?.clientId || account?.clientId || "").trim(),
      sessionToken: String(override?.sessionToken || account?.sessionToken || "").trim(),
    };
    if (leftover) {
      throw fail(
        `This member's ${brokerName} slot still has another broker's token. Paste this member's ${brokerName} client ID and daily access token on My plan.`,
      );
    }
    if (!session.accessToken) {
      throw fail(`This member has no ${brokerName} access token. Install it on My plan.`);
    }
    return { lane: "member", session };
  }
  if (!adminSession?.accessToken) {
    throw fail(`Connect ${brokerName} on Brokers first.`);
  }
  return { lane: "admin", session: adminSession };
}

export function dhanSendOptions(lane = "admin") {
  return {
    lane: lane === "member" ? "member" : "admin",
    attempts: lane === "member" ? 1 : 4,
  };
}
