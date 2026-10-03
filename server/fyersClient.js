const FYERS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function fyersAuthorization(appId, accessToken) {
  const key = String(appId || "").trim();
  const token = String(accessToken || "").trim();
  if (!key || !token) return "";
  return `${key}:${token}`;
}

/** Same Authorization the web SDK stores: AppID + ":" + setAccessToken, plus a browser user agent. */
export function fyersRequestHeaders(appId, accessToken, extra = {}) {
  return {
    Authorization: fyersAuthorization(appId, accessToken),
    Accept: "application/json",
    "User-Agent": FYERS_USER_AGENT,
    ...extra,
  };
}
