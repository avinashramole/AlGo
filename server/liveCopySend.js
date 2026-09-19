import { annotateMemberLiveAuthError, dhanOrderCredentials, liveOrderSession } from "./brokerIsolation.js";
import { placeDhanOrder } from "./dhan.js";
import { liveBrokerMeta, placeLiveBrokerOrder } from "./liveBrokers.js";
import { recordMemberCopyFill } from "./memberDesk.js";

export async function sendMemberCopyOrder(payload = {}, fetchImpl = fetch) {
  const userId = payload.copyUserId;
  if (!userId) return null;
  if (payload.paper || payload.brokerId === "paper") {
    return recordMemberCopyFill({ userId, payload, paper: true });
  }
  const brokerName = liveBrokerMeta(payload.brokerId)?.name || payload.brokerId;
  const creds = payload.brokerSession || payload.account || {};
  try {
    if (payload.brokerId === "dhan") {
      dhanOrderCredentials(payload, { accessToken: "", clientId: "" });
      const live = await placeDhanOrder(payload);
      return recordMemberCopyFill({ userId, payload, live });
    }
    liveOrderSession(payload, null, { brokerName });
    const live = await placeLiveBrokerOrder(payload.brokerId, payload, fetchImpl);
    return recordMemberCopyFill({ userId, payload, live });
  } catch (error) {
    const wrapped = annotateMemberLiveAuthError(error, creds, { brokerName });
    recordMemberCopyFill({ userId, payload, error: wrapped });
    throw wrapped;
  }
}
