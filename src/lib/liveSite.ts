export function isTrade2SmartHost(host = typeof location !== "undefined" ? location.hostname : "") {
  return /trade2smart/i.test(String(host || ""));
}

export function isApiDownError(message = "") {
  return /API is down|API is not running|Desk is reconnecting|Request failed \(50[234]\)|Failed to fetch|NetworkError|ECONNRESET|connection reset/i.test(
    String(message || ""),
  );
}

export function apiDownMessage(host?: string) {
  const liveHost = host || (typeof location !== "undefined" ? location.hostname : "");
  const livePort = typeof location !== "undefined" ? location.port : "";
  if (isTrade2SmartHost(liveHost)) {
    return "Desk is reconnecting. Wait 10 seconds, then press Ctrl+Shift+R. Do not open localhost.";
  }
  if (liveHost === "localhost" && livePort !== "5173" && livePort !== "4173" && livePort !== "4000") {
    return "The phone app cannot reach the live desk. Check mobile data / Wi-Fi, then sign in again.";
  }
  return "API is not running. Keep the npm start window open (both [api] and [web]). Open http://localhost:5173";
}

export function deskLoadHelp(message = "", host?: string) {
  if (isTrade2SmartHost(host) && isApiDownError(message)) return apiDownMessage(host);
  if (isTrade2SmartHost(host)) return "Press Ctrl+Shift+R. If the page still fails, wait 10 seconds and try again.";
  return "In Chrome type http://localhost:5173 and press Enter. Keep npm start open. Then refresh.";
}

export function publicDeskError(message: string, host?: string) {
  const text = String(message || "").trim();
  if (isTrade2SmartHost(host) && /localhost:5173|npm start|port 4000 is old/i.test(text)) return apiDownMessage(host);
  return text;
}

export function catchDeskError(err: unknown, fallback = "Request failed") {
  const text = err instanceof Error ? err.message : String(err || fallback);
  return publicDeskError(text) || fallback;
}
