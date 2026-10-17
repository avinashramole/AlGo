import {
  completeSignup,
  decodeOAuthPayload,
  decodeOAuthState,
  enableThumb,
  googleAppReturnHtml,
  googleAuthorizeUrl,
  googleFrontendReturnUrl,
  googleLoginSearch,
  googleOAuthConfigured,
  googleRedirectUri,
  shouldReturnToApp,
  isEmbeddedWebView,
  googleCapacitorHashReturn,
  loginWithGoogleCode,
  loginWithPassword,
  loginWithThumb,
  queueLoginNotice,
  requestOtp,
  resetPassword,
  safeFrontendOrigin,
  clientAddress,
  recordLoginIp,
  requestToken,
  revokeSession,
  sessionUser,
  setLoginPassword,
  updateProfile,
  verifyOtp,
} from "./auth.js";

function queryValue(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function readToken(req) {
  return requestToken(req);
}

function sessionCookie(token, req, { maxAge = 60 * 60 * 24 * 30 } = {}) {
  const secure = Boolean(req?.secure) || String(req?.headers?.["x-forwarded-proto"] || "") === "https";
  const parts = [`t2s-token=${encodeURIComponent(token || "")}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function keepSession(res, req, token) {
  if (!token) return;
  res.setHeader("Set-Cookie", sessionCookie(token, req));
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILS_ID = 8;
const LOGIN_MAX_FAILS_IP = 40;
const loginFails = new Map();

function loginFailBucket(key) {
  const row = loginFails.get(key);
  if (!row || nowMs() - row.from > LOGIN_WINDOW_MS) {
    const next = { n: 0, from: nowMs() };
    loginFails.set(key, next);
    return next;
  }
  return row;
}

function nowMs() {
  return Date.now();
}

function assertLoginNotLocked(req, identifier) {
  const ip = String(clientAddress(req) || "0").trim() || "0";
  const id = String(identifier || "").trim().toLowerCase();
  const byIp = loginFailBucket(`ip:${ip}`);
  const byId = id ? loginFailBucket(`id:${id}`) : { n: 0 };
  if (byIp.n >= LOGIN_MAX_FAILS_IP || byId.n >= LOGIN_MAX_FAILS_ID) {
    throw Object.assign(new Error("Too many sign-in attempts. Wait a few minutes and try again."), { status: 429 });
  }
}

function noteLoginFailure(req, identifier) {
  const ip = String(clientAddress(req) || "0").trim() || "0";
  const id = String(identifier || "").trim().toLowerCase();
  loginFailBucket(`ip:${ip}`).n += 1;
  if (id) loginFailBucket(`id:${id}`).n += 1;
}

function clearLoginFailures(req, identifier) {
  const ip = String(clientAddress(req) || "0").trim() || "0";
  const id = String(identifier || "").trim().toLowerCase();
  loginFails.delete(`ip:${ip}`);
  if (id) loginFails.delete(`id:${id}`);
}

export function attachLoginRoutes(app, { healthService = "t2s-api", healthExtra } = {}) {
  app.get("/api/health", async (_req, res) => {
    let extra = {};
    try {
      extra =
        typeof healthExtra === "function"
          ? await healthExtra()
          : healthExtra && typeof healthExtra === "object"
            ? healthExtra
            : {};
    } catch {
      extra = {};
    }
    res.json({ ok: true, service: healthService, time: new Date().toISOString(), ...extra });
  });

  app.get("/api/auth/google/status", (req, res) => {
    const configured = googleOAuthConfigured();
    res.json({ configured, redirectUri: configured ? googleRedirectUri(process.env, req) : "" });
  });

  app.get("/api/auth/google", (req, res) => {
    try {
      const next = Array.isArray(req.query.next) ? req.query.next[0] : req.query.next;
      const native = queryValue(req.query.native) === "1";
      res.redirect(googleAuthorizeUrl({ next, native, req }));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Google login is not configured" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const state = queryValue(req.query.state);
    const payload = decodeOAuthPayload(state);
    const next = safeFrontendOrigin(payload.next || decodeOAuthState(state) || process.env.PUBLIC_URL);
    const finish = (query) => {
      if (shouldReturnToApp(payload, next)) {
        if (isEmbeddedWebView(req)) {
          res.redirect(googleCapacitorHashReturn(query));
          return;
        }
        res.status(200).type("html").send(googleAppReturnHtml(query));
        return;
      }
      res.redirect(googleFrontendReturnUrl(next, query));
    };
    try {
      if (req.query.error) {
        throw Object.assign(new Error("Google login was cancelled."), { status: 401 });
      }
      const result = await loginWithGoogleCode({
        code: queryValue(req.query.code),
        redirectUri: payload.redirectUri || googleRedirectUri(process.env, req),
      });
      try {
        recordLoginIp(result.token, clientAddress(req));
      } catch {
        /* login still succeeds if the address cannot be stored */
      }
      try {
        queueLoginNotice(result.user);
      } catch (mailError) {
        console.error("[auth] Google login mail failed:", mailError?.message || mailError);
      }
      if (!shouldReturnToApp(payload, next)) keepSession(res, req, result.token);
      finish(googleLoginSearch(result));
    } catch (error) {
      console.error("[auth] Google callback failed:", error?.message || error);
      finish(`google_error=${encodeURIComponent(error.message || "Google login failed")}`);
    }
  });

  app.post("/api/login", (req, res) => {
    const identifier = req.body?.identifier || req.body?.email || req.body?.mobile;
    try {
      assertLoginNotLocked(req, identifier);
      const result = loginWithPassword(identifier, req.body?.password);
      clearLoginFailures(req, identifier);
      const noted = recordLoginIp(result.token, clientAddress(req));
      if (noted) result.user = noted;
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.json(result);
    } catch (error) {
      if (error.status !== 429) noteLoginFailure(req, identifier);
      res.status(error.status || 401).json({ error: error.message || "Login failed" });
    }
  });

  app.post("/api/auth/otp/request", async (req, res) => {
    try {
      const result = await requestOtp({
        email: req.body?.email,
        mobile: req.body?.mobile,
        identifier: req.body?.identifier,
        name: req.body?.name,
        channel: req.body?.channel,
        purpose: req.body?.purpose,
        provider: req.body?.provider,
      });
      res.json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not send code", needName: Boolean(error.needName) });
    }
  });

  app.post("/api/auth/otp/verify", (req, res) => {
    try {
      const result = verifyOtp({
        email: req.body?.email,
        mobile: req.body?.mobile,
        identifier: req.body?.identifier,
        otp: req.body?.otp,
        purpose: req.body?.purpose,
      });
      if (result.token) {
        const noted = recordLoginIp(result.token, clientAddress(req));
        if (noted) result.user = noted;
        queueLoginNotice(result.user);
        keepSession(res, req, result.token);
      }
      res.json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not verify code" });
    }
  });

  app.post("/api/auth/reset", (req, res) => {
    try {
      const result = resetPassword(req.body || {});
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not reset password" });
    }
  });

  app.post("/api/auth/signup", (req, res) => {
    try {
      const result = completeSignup(req.body || {});
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.status(201).json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Sign up failed" });
    }
  });

  app.post("/api/auth/thumb/enable", (req, res) => {
    try {
      const token = readToken(req);
      res.json(enableThumb(token));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not enable thumb" });
    }
  });

  app.post("/api/auth/thumb", (req, res) => {
    try {
      assertLoginNotLocked(req, "thumb");
      const result = loginWithThumb(req.body?.thumbToken);
      clearLoginFailures(req, "thumb");
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.json(result);
    } catch (error) {
      if (error.status !== 429) noteLoginFailure(req, "thumb");
      res.status(error.status || 401).json({ error: error.message || "Thumb login failed" });
    }
  });

  app.post("/api/logout", (req, res) => {
    try {
      revokeSession(readToken(req));
    } catch {
      /* still clear the browser cookie */
    }
    res.setHeader("Set-Cookie", sessionCookie("", req, { maxAge: 0 }));
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    const token = readToken(req);
    try {
      recordLoginIp(token, clientAddress(req));
    } catch {
      /* the profile still loads when the address cannot be stored */
    }
    const user = sessionUser(token, { reload: true });
    if (!user) {
      res.status(401).json({ error: "Sign in first." });
      return;
    }
    res.json({ user });
  });

  app.post("/api/me", (req, res) => {
    try {
      const token = readToken(req);
      const saved = updateProfile(token, req.body || {});
      keepSession(res, req, token);
      res.json(saved);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not update profile" });
    }
  });

  app.post("/api/me/password", (req, res) => {
    try {
      const token = readToken(req);
      const saved = setLoginPassword(token, req.body || {});
      keepSession(res, req, token);
      res.json(saved);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not save password" });
    }
  });
}
