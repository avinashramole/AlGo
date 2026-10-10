export const LIVE_DESK_ORIGIN = "https://trade2smart.com";
export const APP_LOGIN_SCHEME = "t2salgo";
export const APP_LOGIN_ORIGIN = `${APP_LOGIN_SCHEME}://auth`;

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

export function googleLoginNextFrom({ native, origin }: { native?: boolean; origin?: string } = {}) {
  if (native) return APP_LOGIN_ORIGIN;
  return origin || LIVE_DESK_ORIGIN;
}

export function googleLoginNext() {
  if (typeof window === "undefined") return LIVE_DESK_ORIGIN;
  return googleLoginNextFrom({
    native: isNativeHybrid(),
    origin: window.location.origin,
  });
}

export function googleQueryFromHref(href = "", search = "", hash = "") {
  const read = (value: string) => {
    const params = new URLSearchParams(value.startsWith("?") ? value.slice(1) : value);
    if (params.get("google_token") || params.get("google_error")) return params;
    return null;
  };
  if (href) {
    try {
      const url = new URL(href);
      const fromUrl = read(url.search);
      if (fromUrl) return fromUrl;
      if (url.hash.includes("?")) {
        const fromHash = read(url.hash.slice(url.hash.indexOf("?")));
        if (fromHash) return fromHash;
      }
    } catch {
      /* ignore malformed custom-scheme URLs until we parse the query by hand */
      const q = href.indexOf("?");
      if (q >= 0) {
        const fromHref = read(href.slice(q));
        if (fromHref) return fromHref;
      }
    }
  }
  return read(search) || (hash.includes("?") ? read(hash.slice(hash.indexOf("?"))) : null) || new URLSearchParams();
}

export function deskHomeUrl() {
  return isNativeHybrid() ? `${LIVE_DESK_ORIGIN}/#/` : "/";
}
