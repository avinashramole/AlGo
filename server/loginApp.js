import {
  completeSignup,
  decodeOAuthPayload,
  decodeOAuthState,
  enableThumb,
  googleAuthorizeUrl,
  googleOAuthConfigured,
  googleRedirectUri,
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
  sessionUser,
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

export function attachLoginRoutes(app, { healthService = "t2s-api" } = {}) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: healthService, time: new Date().toISOString() });
  });

  app.get("/api/auth/google/status", (req, res) => {
    const configured = googleOAuthConfigured();
    res.json({ configured, redirectUri: configured ? googleRedirectUri(process.env, req) : "" });
  });

  app.get("/api/auth/google", (req, res) => {
    try {
      const next = Array.isArray(req.query.next) ? req.query.next[0] : req.query.next;
      res.redirect(googleAuthorizeUrl({ next, req }));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Google login is not configured" });
    }
  });

  app.get("/api/auth/google/callback", async (req, res) => {
    const state = queryValue(req.query.state);
    const payload = decodeOAuthPayload(state);
    const next = safeFrontendOrigin(payload.next || decodeOAuthState(state) || process.env.PUBLIC_URL);
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
      keepSession(res, req, result.token);
      res.redirect(`${next}/login?google_token=${encodeURIComponent(result.token)}`);
    } catch (error) {
      console.error("[auth] Google callback failed:", error?.message || error);
      res.redirect(`${next}/login?google_error=${encodeURIComponent(error.message || "Google login failed")}`);
    }
  });

  app.post("/api/login", (req, res) => {
    try {
      const result = loginWithPassword(req.body?.identifier || req.body?.email || req.body?.mobile, req.body?.password);
      const noted = recordLoginIp(result.token, clientAddress(req));
      if (noted) result.user = noted;
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.json(result);
    } catch (error) {
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
      const result = loginWithThumb(req.body?.thumbToken);
      queueLoginNotice(result.user);
      keepSession(res, req, result.token);
      res.json(result);
    } catch (error) {
      res.status(error.status || 401).json({ error: error.message || "Thumb login failed" });
    }
  });

  app.post("/api/logout", (_req, res) => {
    res.setHeader("Set-Cookie", sessionCookie("", _req, { maxAge: 0 }));
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    const token = readToken(req);
    recordLoginIp(token, clientAddress(req));
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
}
