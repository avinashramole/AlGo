import { placeDhanOrder } from "./dhan.js";
import { placeLiveBrokerOrder } from "./liveBrokers.js";
import { recordMemberCopyFill } from "./memberDesk.js";

export async function sendMemberCopyOrder(payload = {}) {
  const userId = payload.copyUserId;
  if (!userId) return null;
  if (payload.paper || payload.brokerId === "paper") {
    return recordMemberCopyFill({ userId, payload, paper: true });
  }
  try {
    const live =
      payload.brokerId === "dhan"
        ? await placeDhanOrder(payload)
        : await placeLiveBrokerOrder(payload.brokerId, payload);
    return recordMemberCopyFill({ userId, payload, live });
  } catch (error) {
    recordMemberCopyFill({ userId, payload, error });
    throw error;
  }
}
