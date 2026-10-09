export const LIVE_DESK_ORIGIN = "https://trade2smart.com";

type CapacitorBridge = {
  isNativePlatform?: () => boolean;
};

function capacitorBridge(): CapacitorBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor;
}

export function isLocalDeskHost(hostname = "", port = "") {
  const host = String(hostname || "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2";
  if (!local) return false;
  return port !== "5173" && port !== "4173" && port !== "4000";
}

export function isNativeHybrid() {
  try {
    if (capacitorBridge()?.isNativePlatform?.()) return true;
    if (typeof window !== "undefined" && window.location.protocol === "capacitor:") return true;
    if (typeof window !== "undefined" && isLocalDeskHost(window.location.hostname, window.location.port)) return true;
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

export function apiBaseFromLocation(hostname = "", port = "", protocol = "") {
  const host = String(hostname || "").toLowerCase();
  if (host.includes("trade2smart")) return "/api";
  if (protocol === "capacitor:" || isLocalDeskHost(host, port)) return `${LIVE_DESK_ORIGIN}/api`;
  return "/api";
}

export function apiBase() {
  if (typeof window === "undefined") return "/api";
  return apiBaseFromLocation(window.location.hostname, window.location.port, window.location.protocol);
}

export function googleLoginNext() {
  if (typeof window === "undefined") return LIVE_DESK_ORIGIN;
  return isNativeHybrid() ? LIVE_DESK_ORIGIN : window.location.origin;
}
