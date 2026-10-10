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
  return isNativeHybrid() ? "/#/" : "/";
}

export function isLiveDeskHref(href = "") {
  try {
    const url = new URL(href);
    return url.hostname === "trade2smart.com" || url.hostname.endsWith(".trade2smart.com");
  } catch {
    return false;
  }
}

export function googleDeskHashUrl(params: URLSearchParams | string) {
  const q = typeof params === "string" ? String(params).replace(/^\?/, "") : params.toString();
  if (typeof window !== "undefined" && isNativeHybrid()) return `/#/?${q}`;
  return `${LIVE_DESK_ORIGIN}/#/?${q}`;
}

export function isAndroidBrowser() {
  try {
    if (isNativeHybrid()) return false;
    return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");
  } catch {
    return false;
  }
}

export function googleAppIntentUrl(query: URLSearchParams | string) {
  const q = typeof query === "string" ? String(query).replace(/^\?/, "") : query.toString();
  return `intent://auth?${q}#Intent;scheme=${APP_LOGIN_SCHEME};package=com.t2s.algo;end`;
}

export function shouldHandoffGoogleToApp(params: URLSearchParams) {
  return Boolean(params.get("google_token")) && isAndroidBrowser();
}

export function handoffGoogleToAndroidApp(params: URLSearchParams) {
  const intent = googleAppIntentUrl(params);
  try {
    window.location.replace(intent);
  } catch {
    /* Chrome may require the visible Open-the-app link */
  }
  return intent;
}
