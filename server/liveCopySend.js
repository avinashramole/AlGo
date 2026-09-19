import { dhanOrderCredentials, liveOrderSession } from "./brokerIsolation.js";
import { placeDhanOrder } from "./dhan.js";
import { liveBrokerMeta, placeLiveBrokerOrder } from "./liveBrokers.js";
import { recordMemberCopyFill } from "./memberDesk.js";

export async function sendMemberCopyOrder(payload = {}) {
  const userId = payload.copyUserId;
  if (!userId) return null;
  if (payload.paper || payload.brokerId === "paper") {
    return recordMemberCopyFill({ userId, payload, paper: true });
  }
  try {
    if (payload.brokerId === "dhan") {
      dhanOrderCredentials(payload, { accessToken: "", clientId: "" });
      const live = await placeDhanOrder(payload);
      return recordMemberCopyFill({ userId, payload, live });
    }
    liveOrderSession(payload, null, { brokerName: liveBrokerMeta(payload.brokerId)?.name || payload.brokerId });
    const live = await placeLiveBrokerOrder(payload.brokerId, payload);
    return recordMemberCopyFill({ userId, payload, live });
  } catch (error) {
    recordMemberCopyFill({ userId, payload, error });
    throw error;
  }
}
