import { isNativeHybrid } from "./hybrid";

export const LOGOUT_CONFIRM_MESSAGE = "Are you sure you want to log out?";

export function shouldAskLogoutConfirm() {
  if (isNativeHybrid()) return true;
  if (typeof document !== "undefined" && document.documentElement.classList.contains("t2s-hybrid")) return true;
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "")) {
    return true;
  }
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(max-width: 767px)").matches) return true;
    return Number(window.innerWidth || 0) > 0 && window.innerWidth <= 767;
  } catch {
    return false;
  }
}

export function confirmLogout() {
  if (!shouldAskLogoutConfirm()) return true;
  return false;
}

export function requestLogout(logout: () => void, ask?: (next: () => void) => void) {
  if (!shouldAskLogoutConfirm()) {
    logout();
    return;
  }
  if (typeof ask === "function") {
    ask(logout);
  }
}
