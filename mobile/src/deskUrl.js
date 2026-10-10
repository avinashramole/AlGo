export const LIVE_DESK = "https://trade2smart.com";

export function deskOriginFromHost(hostUri = "", envWeb = "") {
  const env = String(envWeb || "").trim().replace(/\/$/, "");
  if (env) return env;
  const ip = String(hostUri || "").match(/(\d+\.\d+\.\d+\.\d+)/)?.[1];
  if (ip) return `http://${ip}:5173`;
  return LIVE_DESK;
}

export function deskStartPath(role = "") {
  return String(role || "").toLowerCase() === "admin" ? "/algo" : "/";
}

export function sessionBootstrapScript(token = "", user = null, startPath = "/") {
  const safeToken = JSON.stringify(String(token || ""));
  const safeUser = JSON.stringify(user || null);
  const safeStart = JSON.stringify(String(startPath || "/"));
  return `(function(){
    var token = ${safeToken};
    var user = ${safeUser};
    var startPath = ${safeStart};
    try {
      if (token) {
        localStorage.setItem("t2s-token", token);
        localStorage.setItem("t2s-remember", "1");
        if (user) localStorage.setItem("t2s-user", JSON.stringify(user));
        var here = String(location.pathname || "") + String(location.hash || "");
        if (/\\/login\\/?/i.test(here)) location.replace(location.origin + startPath);
      }
    } catch (e) {}
    true;
  })();`;
}

export function isDeskLoginUrl(url = "") {
  const raw = String(url || "");
  return /\/login\/?(\?|#|$)/i.test(raw) || /#\/login\/?(\?|#|$)/i.test(raw);
}
