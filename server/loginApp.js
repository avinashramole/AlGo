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
  sessionUser,
  updateProfile,
  verifyOtp,
} from "./auth.js";

function queryValue(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function readToken(req) {
  return String(req.body?.token || req.query?.token || req.headers.authorization || "").replace(/^Bearer\s+/i, "");
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
        queueLoginNotice(result.user);
      } catch (mailError) {
        console.error("[auth] Google login mail failed:", mailError?.message || mailError);
      }
      res.redirect(`${next}/login?google_token=${encodeURIComponent(result.token)}`);
    } catch (error) {
      console.error("[auth] Google callback failed:", error?.message || error);
      res.redirect(`${next}/login?google_error=${encodeURIComponent(error.message || "Google login failed")}`);
    }
  });

  app.post("/api/login", (req, res) => {
    try {
      const result = loginWithPassword(req.body?.identifier || req.body?.email || req.body?.mobile, req.body?.password);
      queueLoginNotice(result.user);
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
      if (result.token) queueLoginNotice(result.user);
      res.json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not verify code" });
    }
  });

  app.post("/api/auth/reset", (req, res) => {
    try {
      const result = resetPassword(req.body || {});
      queueLoginNotice(result.user);
      res.json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not reset password" });
    }
  });

  app.post("/api/auth/signup", (req, res) => {
    try {
      const result = completeSignup(req.body || {});
      queueLoginNotice(result.user);
      res.status(201).json(result);
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Sign up failed" });
    }
  });

  app.post("/api/auth/thumb/enable", (req, res) => {
    try {
      const token = String(req.body?.token || req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      res.json(enableThumb(token));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not enable thumb" });
    }
  });

  app.post("/api/auth/thumb", (req, res) => {
    try {
      const result = loginWithThumb(req.body?.thumbToken);
      queueLoginNotice(result.user);
      res.json(result);
    } catch (error) {
      res.status(error.status || 401).json({ error: error.message || "Thumb login failed" });
    }
  });

  app.get("/api/me", (req, res) => {
    const user = sessionUser(readToken(req), { reload: true });
    if (!user) {
      res.status(401).json({ error: "Sign in first." });
      return;
    }
    res.json({ user });
  });

  app.post("/api/me", (req, res) => {
    try {
      res.json(updateProfile(readToken(req), req.body || {}));
    } catch (error) {
      res.status(error.status || 400).json({ error: error.message || "Could not update profile" });
    }
  });
}
