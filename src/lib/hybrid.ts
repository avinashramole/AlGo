export const LIVE_DESK_ORIGIN = "https://trade2smart.com";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
};

function capacitorBridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

export function isNativeHybrid() {
  try {
    if (capacitorBridge()?.isNativePlatform?.()) return true;
    if (typeof window !== "undefined" && window.location.protocol === "capacitor:") return true;
    if (typeof navigator !== "undefined" && /;\s*wv\)/i.test(navigator.userAgent)) return true;
    return false;
  } catch {
    return false;
  }
}

export function markHybridDocument() {
  if (typeof document === "undefined") return;
  if (!isNativeHybrid()) return;
  document.documentElement.classList.add("t2s-hybrid");
  const viewport = document.querySelector('meta[name="viewport"]');
  viewport?.setAttribute(
    "content",
    "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
  );
}

export function apiBase() {
  return isNativeHybrid() ? `${LIVE_DESK_ORIGIN}/api` : "/api";
}

export function googleLoginNext() {
  if (typeof window === "undefined") return LIVE_DESK_ORIGIN;
  return isNativeHybrid() ? LIVE_DESK_ORIGIN : window.location.origin;
}
