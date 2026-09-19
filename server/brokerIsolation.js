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

export function liveOrderSession(payload = {}, adminSession = null, { brokerName = "broker" } = {}) {
  const override = payload.brokerSession && typeof payload.brokerSession === "object" ? payload.brokerSession : null;
  if (isMemberScopedOrder(payload)) {
    const session = {
      accessToken: String(override?.accessToken || "").trim(),
      apiKey: String(override?.apiKey || payload.account?.apiKey || "").trim(),
      clientId: String(override?.clientId || payload.account?.clientId || "").trim(),
      sessionToken: String(override?.sessionToken || payload.account?.sessionToken || "").trim(),
    };
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
