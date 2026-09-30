import { getPublicUser, SOLE_ADMIN_ID } from "./auth.js";
import { messagingHandleForUser, sendMessaging, upsertMessagingContact } from "./messaging.js";

export function buildCopyAlertText({ side, qty, symbol, strategy, status, error, reason } = {}) {
  const action = `${String(side || "BUY").toUpperCase()} ${Math.max(1, Math.round(Number(qty) || 1))} ${String(symbol || "contract").trim()}`;
  const strat = String(strategy || "").trim();
  const note = strat ? ` · ${strat}` : "";
  if (error) return `Copy failed: ${action}${note} · ${String(error.message || error)}`;
  const label = `Copied ${action}${note} · ${String(status || "PENDING").toUpperCase()}`;
  const why = String(reason || "").trim();
  return why ? `${label} · ${why}` : label;
}

export function copyNotifyChannels(notifications = {}) {
  if (notifications?.instantAlerts === false) return [];
  const channels = [];
  if (notifications?.whatsapp !== false) channels.push("whatsapp");
  if (notifications?.telegram) channels.push("telegram");
  return channels;
}

export async function notifyMemberCopy({ userId, text, notifications, fetchImpl = fetch } = {}) {
  const id = String(userId || "").trim();
  const body = String(text || "").trim();
  const channels = copyNotifyChannels(notifications);
  if (!id || !body || !channels.length) return { sent: false, reason: "skipped" };
  const user = getPublicUser(id);
  const handle = messagingHandleForUser(id);
  const mobile = String(user?.mobile || handle.mobile || "").trim();
  const telegramId = String(handle.telegramId || "").trim();
  if (!mobile && !telegramId) return { sent: false, reason: "no-contact" };
  try {
    upsertMessagingContact({
      id,
      userId: id,
      name: user?.name || "Member",
      mobile,
      telegramId,
      broker: "T2S",
    });
    const via = channels.includes("whatsapp") && channels.includes("telegram") ? "both" : channels[0];
    const result = await sendMessaging({
      contactId: id,
      text: body,
      via,
      users: user ? [user] : [],
      fetchImpl,
    });
    return { sent: true, via: result?.message?.via || via };
  } catch {
    return { sent: false, reason: "send-failed" };
  }
}

export function queueMemberCopyNotify(args = {}) {
  void notifyMemberCopy(args).catch(() => undefined);
}

export async function notifyCopyAlertToMemberAndAdmin({
  userId,
  text,
  notifications,
  fetchImpl = fetch,
  adminId = SOLE_ADMIN_ID,
} = {}) {
  const memberId = String(userId || "").trim();
  const deskAdminId = String(adminId || SOLE_ADMIN_ID).trim();
  const member = notifyMemberCopy({ userId: memberId, text, notifications, fetchImpl });
  const admin =
    deskAdminId && deskAdminId !== memberId
      ? notifyMemberCopy({
          userId: deskAdminId,
          text,
          notifications: { instantAlerts: true, whatsapp: true, telegram: true },
          fetchImpl,
        })
      : Promise.resolve({ sent: false, reason: "admin" });
  const [memberResult, adminResult] = await Promise.all([member, admin]);
  return { member: memberResult, admin: adminResult };
}

export function queueCopyAlertToMemberAndAdmin(args = {}) {
  void notifyCopyAlertToMemberAndAdmin(args).catch(() => undefined);
}
