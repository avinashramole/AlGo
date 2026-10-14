import { annotateMemberLiveAuthError, liveOrderSession } from "./brokerIsolation.js";
import { placeDhanOrder } from "./dhan.js";
import { liveBrokerMeta, placeLiveBrokerOrder } from "./liveBrokers.js";
import { peekAdminBrokerSecrets, recordMemberCopyFill } from "./memberDesk.js";
import { requestUpstoxTradingTokenForUser } from "./upstoxAuth.js";

function adminFallbackSession(brokerId) {
  const id = String(brokerId || "").trim().toLowerCase();
  if (!id || id === "paper" || id === "kotak") return null;
  const row = peekAdminBrokerSecrets(id);
  const accessToken = String(row?.brokerToken || "").trim();
  if (!accessToken) return null;
  return {
    accessToken,
    clientId: String(row.accountId || "").trim(),
    apiKey: String(row.brokerApiKey || "").trim(),
    sessionToken: String(row.brokerSessionToken || "").trim(),
  };
}

export async function sendMemberCopyOrder(payload = {}, fetchImpl = fetch) {
  const userId = payload.copyUserId;
  if (!userId) return null;
  if (payload.paper || payload.brokerId === "paper") {
    return recordMemberCopyFill({ userId, payload, paper: true });
  }
  if (payload.copyBlocked) {
    const error = new Error(String(payload.copyBlocked));
    error.status = 400;
    recordMemberCopyFill({ userId, payload, error });
    throw error;
  }
  const brokerName = liveBrokerMeta(payload.brokerId)?.name || payload.brokerId;
  let creds = payload.brokerSession || payload.account || {};
  if (!String(creds.accessToken || "").trim()) {
    const adminSession = adminFallbackSession(payload.brokerId);
    if (adminSession) {
      creds = { ...creds, ...adminSession };
      payload = { ...payload, account: creds, brokerSession: creds };
    }
  }
  try {
    if (payload.brokerId === "dhan") {
      const live = await placeDhanOrder(payload);
      return recordMemberCopyFill({ userId, payload, live });
    }
    if (payload.brokerId === "upstox" && (payload.leftoverSlot || creds.leftoverSlot)) {
      liveOrderSession(payload, null, { brokerName });
    }
    if (payload.brokerId === "upstox" && !String(creds.accessToken || "").trim()) {
      const asked = await requestUpstoxTradingTokenForUser(userId, fetchImpl);
      const error = new Error(
        asked.ok
          ? "Approve today's Upstox trading token in the Upstox app / WhatsApp. After you approve, the next copy uses it."
          : "This member has no Upstox trading token. Save API key + API secret on Settings, then tap Gets Token.",
      );
      error.status = 401;
      throw error;
    }
    liveOrderSession(payload, null, { brokerName });
    const live = await placeLiveBrokerOrder(payload.brokerId, payload, fetchImpl);
    return recordMemberCopyFill({ userId, payload, live });
  } catch (error) {
    let wrapped = annotateMemberLiveAuthError(error, creds, { brokerName });
    if (payload.brokerId === "upstox" && (error?.status === 401 || /401|unauthorized|UDAPI1000/i.test(String(error?.message || "")))) {
      try {
        const asked = await requestUpstoxTradingTokenForUser(userId, fetchImpl);
        if (asked.ok) {
          wrapped = annotateMemberLiveAuthError(
            new Error(`${wrapped.message} Asked Upstox to issue today's trading token — approve the app notification, then the next copy will use it.`),
            creds,
            { brokerName },
          );
        }
      } catch {
        /* keep the original 401 */
      }
    }
    recordMemberCopyFill({ userId, payload, error: wrapped });
    throw wrapped;
  }
}
