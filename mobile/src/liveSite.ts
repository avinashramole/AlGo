export function isTrade2SmartHost(host = "") {
  return /trade2smart/i.test(String(host || ""));
}

export function isApiDownError(message = "") {
  return /API is down|API is not running|Request failed \(50[234]\)|Failed to fetch|NetworkError/i.test(
    String(message || ""),
  );
}

export function apiDownMessage(host?: string) {
  if (isTrade2SmartHost(host)) {
    return "Desk is reconnecting. Wait 10 seconds, then press Ctrl+Shift+R. Do not open localhost.";
  }
  return "API is not running. Keep npm start open. Open http://localhost:5173";
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
