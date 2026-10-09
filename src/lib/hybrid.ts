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
    return typeof window !== "undefined" && window.location.protocol === "capacitor:";
  } catch {
    return false;
  }
}

export function apiBase() {
  return isNativeHybrid() ? `${LIVE_DESK_ORIGIN}/api` : "/api";
}

export function googleLoginNext() {
  if (typeof window === "undefined") return LIVE_DESK_ORIGIN;
  return isNativeHybrid() ? LIVE_DESK_ORIGIN : window.location.origin;
}
