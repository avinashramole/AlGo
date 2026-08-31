import { thisComputerPublicIpv4 } from "./ipv4.js";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activateBroker, connectBroker, disconnectBroker, idleDhan, publicBrokers } from "./brokers.js";
import { bootDhanFromEnv, cancelDhanOrder, enableDhanAuto, fetchDhanHistory, isDhanLive, placeDhanOrder, rotateDhanAccessToken, selectOptionDesk, startDhanLive, stopDhanLive } from "./dhan.js";
import { connectGmail, completeSignup, enableThumb, gmailStatus, loginWithPassword, loginWithThumb, notifyLogin, requestOtp, resetPassword, sessionUser, updateProfile, verifyOtp } from "./auth.js";
import { contractCatalog, publicCatalog, resolveFrontFutures } from "./frontFutures.js";
import {
  addChat,
  applyBrokerPositions,
  applySyntheticOptionChain,
  assignAlgoBroker,
  cancelOrder,
  createAlgo,
  deleteAlgo,
  dropBrokerPositions,
  getCandles,
  getOptionMeta,
  placeOrder,
  snapshot,
  squareOff,
  tickMarket,
  toggleAlgo,
  updateAlgo,
  backtestAlgo,
  getAlgo,
  pickBacktestTimeframe,
  resolveBacktestWindow,
  drainPendingLiveAlgoOrders,
  noteLiveAlgoOrderResult,
} from "./market.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const file of [path.join(__dirname, ".env"), path.join(__dirname, "..", ".env")]) {
    try {
      const text = fs.readFileSync(file, "utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq < 1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = value;
      }
    } catch {
      /* no env file */
    }
  }
}

loadEnv();

const app = express();
const port = Number(process.env.PORT) || 4000;
const PREVIEW_ORDER_ERROR =
  "Chrome is fine, but this address is a Cursor preview (agent.cvm.dev), not your PC. In the Chrome address bar type exactly http://localhost:5173 and press Enter. Keep npm start running. Do not add another IP.";

function isPreviewRequest(req) {
  const origin = `${req.headers.origin || ""} ${req.headers.referer || ""}`;
  return /cvm\.dev|cursor\.sh|ngrok|trycloudflare|githubpreview|github\.dev/i.test(origin);
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

setInterval(tickMarket, 1500);
setInterval(() => {
  void flushLiveAlgoOrders();
}, 1500);

let flushingLiveAlgos = false;

async function flushLiveAlgoOrders() {
  if (flushingLiveAlgos || !isDhanLive()) return;
  const queued = drainPendingLiveAlgoOrders();
  if (!queued.length) return;
  flushingLiveAlgos = true;
  try {
    for (const payload of queued) {
      try {
        const live = await placeDhanOrder(payload);
        const order = placeOrder({ ...payload, brokerId: "dhan", live });
        noteLiveAlgoOrderResult(payload, live, order?.error);
        if (order?.error) {
          console.log(`Strategy live fill book: ${order.error}`);
        }
      } catch (error) {
        placeOrder({
          ...payload,
          brokerId: "dhan",
          live: { orderId: `rej-algo-${Date.now()}`, status: "REJECTED" },
        });
        noteLiveAlgoOrderResult(payload, { status: "REJECTED" }, error);
        console.log(`Strategy live order failed: ${error.message || error}`);
      }
    }
  } finally {
    flushingLiveAlgos = false;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "t2s-api", time: new Date().toISOString() });
});

app.post("/api/login", async (req, res) => {
  try {
    const result = loginWithPassword(req.body?.identifier || req.body?.email || req.body?.mobile, req.body?.password);
    const mail = await notifyLogin(result.user);
    res.json({ ...result, mail });
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || "Login failed" });
  }
});

app.get("/api/auth/gmail", (_req, res) => {
  res.json(gmailStatus());
});

app.post("/api/auth/gmail", async (req, res) => {
  try {
    const result = await connectGmail({ email: req.body?.email, appPassword: req.body?.appPassword || req.body?.password });
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Gmail connect failed" });
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

app.post("/api/auth/otp/verify", async (req, res) => {
  try {
    const result = verifyOtp({
      email: req.body?.email,
      mobile: req.body?.mobile,
      identifier: req.body?.identifier,
      otp: req.body?.otp,
      purpose: req.body?.purpose,
    });
    if (result.token) {
      const mail = await notifyLogin(result.user);
      res.json({ ...result, mail });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not verify code" });
  }
});

app.post("/api/auth/reset", async (req, res) => {
  try {
    const result = resetPassword(req.body || {});
    const mail = await notifyLogin(result.user);
    res.json({ ...result, mail });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not reset password" });
  }
});

app.post("/api/auth/signup", async (req, res) => {
  try {
    const result = completeSignup(req.body || {});
    const mail = await notifyLogin(result.user);
    res.status(201).json({ ...result, mail });
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

app.post("/api/auth/thumb", async (req, res) => {
  try {
    const result = loginWithThumb(req.body?.thumbToken);
    const mail = await notifyLogin(result.user);
    res.json({ ...result, mail });
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || "Thumb login failed" });
  }
});

function readToken(req) {
  return String(req.body?.token || req.query?.token || req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

app.get("/api/me", (req, res) => {
  const user = sessionUser(readToken(req));
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

app.get("/api/snapshot", (_req, res) => {
  res.json(snapshot());
});

app.get("/api/brokers", (_req, res) => {
  res.json(publicBrokers());
});

app.post("/api/brokers/dhan/auto", async (req, res) => {
  try {
    const result = await enableDhanAuto({
      clientId: req.body?.clientId,
      pin: req.body?.pin,
      totpSecret: req.body?.totpSecret || req.body?.totp,
    });
    res.json({
      ok: true,
      live: true,
      rotated: true,
      tokenHint: result.tokenHint,
      autoMode: result.autoMode,
      tokenExpiry: result.tokenExpiry,
      nextRenewAt: result.nextRenewAt,
      account: publicBrokers().brokers.find((item) => item.id === "dhan"),
      snapshot: snapshot(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not generate Dhan token" });
  }
});

app.post("/api/brokers/dhan/refresh", async (req, res) => {
  try {
    const result = await rotateDhanAccessToken({
      clientId: req.body?.clientId,
      pin: req.body?.pin,
      totpSecret: req.body?.totpSecret || req.body?.totp,
      reason: "api",
    });
    res.json({
      ok: true,
      live: true,
      rotated: true,
      tokenHint: result.tokenHint,
      autoMode: result.autoMode,
      tokenExpiry: result.tokenExpiry,
      nextRenewAt: result.nextRenewAt,
      account: publicBrokers().brokers.find((item) => item.id === "dhan"),
      snapshot: snapshot(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not change Dhan token" });
  }
});

app.post("/api/brokers/:id/connect", async (req, res) => {
  try {
    if (req.params.id === "dhan") {
      const result = await startDhanLive({
        accessToken: req.body?.accessToken || req.body?.apiKey,
        clientId: req.body?.clientId,
      });
      res.json({
        ok: true,
        live: true,
        tokenHint: result.tokenHint,
        account: publicBrokers().brokers.find((item) => item.id === "dhan"),
        snapshot: snapshot(),
      });
      return;
    }

    const result = connectBroker(req.params.id, req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    applyBrokerPositions(result.positions || [], req.params.id);
    res.json({ ...result, snapshot: snapshot() });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Dhan connect failed" });
  }
});

app.post("/api/brokers/:id/disconnect", (req, res) => {
  if (req.params.id === "dhan") {
    stopDhanLive();
    idleDhan();
    res.json({ ok: true, stoppedLive: true, ...publicBrokers(), snapshot: snapshot() });
    return;
  }
  const result = disconnectBroker(req.params.id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  dropBrokerPositions(req.params.id);
  res.json({ ...result, snapshot: snapshot() });
});

app.post("/api/brokers/:id/activate", (req, res) => {
  const result = activateBroker(req.params.id);
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ ...result, snapshot: snapshot() });
});

app.get("/api/candles", (req, res) => {
  res.json(getCandles(String(req.query.tf || "5m")));
});

app.get("/api/option-chain", (_req, res) => {
  res.json({ ...getOptionMeta(), rows: snapshot().optionChain });
});

app.get("/api/contracts", async (req, res) => {
  try {
    await resolveFrontFutures();
  } catch {
    /* return whatever the scrip cache already has */
  }
  res.json(
    publicCatalog({
      symbol: req.query.symbol ? String(req.query.symbol) : "",
      expiry: req.query.expiry ? String(req.query.expiry) : "",
    }),
  );
});

app.post("/api/option-chain/select", async (req, res) => {
  try {
    await selectOptionDesk({
      symbol: String(req.body?.symbol || "NIFTY"),
      expiry: req.body?.expiry,
    });
    res.json({ ok: true, meta: getOptionMeta(), snapshot: snapshot() });
  } catch (error) {
    applySyntheticOptionChain(String(req.body?.symbol || "NIFTY"), req.body?.expiry);
    res.status(error.status || 400).json({ error: error.message || "Option chain failed", snapshot: snapshot() });
  }
});

app.post("/api/algos/:id/toggle", (req, res) => {
  const current = getAlgo(req.params.id);
  if (current && current.runMode === "live" && !current.enabled && !isDhanLive()) {
    res.status(400).json({ error: "Start live needs Dhan LIVE — real CE/PE and futures orders only." });
    return;
  }
  const algo = toggleAlgo(req.params.id);
  if (!algo) {
    res.status(404).json({ error: "Algo not found" });
    return;
  }
  if (algo.error) {
    res.status(400).json({ error: algo.error, snapshot: snapshot() });
    return;
  }
  res.json({ ...algo, snapshot: snapshot() });
});

app.post("/api/algos", (req, res) => {
  const algo = createAlgo(req.body || {});
  res.status(201).json({ ok: true, algo, snapshot: snapshot() });
});

app.put("/api/algos/:id", (req, res) => {
  const result = updateAlgo(req.params.id, req.body || {});
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ ok: true, algo: result, snapshot: snapshot() });
});

app.delete("/api/algos/:id", (req, res) => {
  const result = deleteAlgo(req.params.id);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ ok: true, ...result, snapshot: snapshot() });
});

app.post("/api/algos/:id/broker", (req, res) => {
  const result = assignAlgoBroker(req.params.id, String(req.body?.brokerId || ""));
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/algos/:id/backtest", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const algo = getAlgo(id);
    if (!algo) {
      res.status(404).json({ error: "Strategy not found" });
      return;
    }
    const window = resolveBacktestWindow(req.body || {});
    if (window.error) {
      res.status(400).json({ error: window.error });
      return;
    }
    const timeframe = pickBacktestTimeframe(algo.timeframe, window.days);
    let candles = [];
    if (isDhanLive()) {
      try {
        candles = await fetchDhanHistory({
          symbol: algo.symbol,
          from: window.from,
          to: window.to,
          timeframe,
        });
      } catch {
        candles = [];
      }
    }
    const result = backtestAlgo(id, {
      range: window.range,
      from: window.from,
      to: window.to,
      candles,
    });
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ...result, snapshot: snapshot() });
  } catch (error) {
    res.status(400).json({ error: error.message || "Backtest failed" });
  }
});

app.post("/api/orders", async (req, res) => {
  const body = req.body || {};
  const brokerId = String(body.brokerId || snapshot().activeBrokerId || "dhan");
  try {
    if (brokerId === "dhan" && isDhanLive()) {
      if (isPreviewRequest(req)) {
        res.status(400).json({ ok: false, live: false, error: PREVIEW_ORDER_ERROR });
        return;
      }
      const live = await placeDhanOrder(body);
      let order = snapshot().orders.find((row) => String(row.id) === String(live.orderId));
      if (!order) {
        order = placeOrder({ ...body, brokerId, live });
        if (order.error) {
          res.status(400).json({ error: order.error });
          return;
        }
      }
      res.status(201).json({
        ok: true,
        live: true,
        afterMarketOrder: Boolean(live.afterMarketOrder),
        order,
        snapshot: snapshot(),
      });
      return;
    }
    const order = placeOrder({ ...body, brokerId, live: null });
    if (order.error) {
      res.status(400).json({ error: order.error });
      return;
    }
    res.status(201).json({
      ok: true,
      live: false,
      warning:
        brokerId === "dhan"
          ? "Order stayed on the T2S desk. Dhan is selected but not LIVE — paste Access Token on Brokers."
          : undefined,
      order,
      snapshot: snapshot(),
    });
  } catch (error) {
    res.status(error.status || 400).json({
      ok: false,
      live: false,
      error: String(error.message || "Order failed"),
    });
  }
});

app.post("/api/orders/:id/cancel", async (req, res) => {
  try {
    const id = String(req.params.id || "");
    const row = snapshot().orders.find((item) => String(item.id) === id);
    if (row?.paper || row?.brokerId === "paper") {
      const result = cancelOrder(id);
      if (result.error) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, order: result, snapshot: snapshot() });
      return;
    }
    if (isDhanLive() && id && !id.startsWith("o") && !id.startsWith("p")) {
      await cancelDhanOrder(id);
      res.json({ ok: true, live: true, snapshot: snapshot() });
      return;
    }
    if (isDhanLive()) {
      res.status(400).json({ error: "LIVE mode only cancels real Dhan orders." });
      return;
    }
    const result = cancelOrder(id);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, order: result, snapshot: snapshot() });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || "Cancel failed" });
  }
});

app.post("/api/positions/:id/squareoff", async (req, res) => {
  try {
    const pos = snapshot().positions.find((row) => row.id === req.params.id);
    if (!pos) {
      res.status(404).json({ error: "Position not found" });
      return;
    }
    if (isDhanLive()) {
      if (pos.paper || pos.brokerId === "paper") {
        const result = squareOff(req.params.id);
        if (result.error) {
          res.status(400).json({ error: result.error });
          return;
        }
        res.json({ ...result, snapshot: snapshot() });
        return;
      }
      if (pos.sim || pos.brokerId !== "dhan" || !pos.securityId || !String(pos.id).startsWith("dhan-pos-")) {
        res.status(400).json({ error: "LIVE mode only squares real Dhan positions." });
        return;
      }
      if (isPreviewRequest(req)) {
        res.status(400).json({ error: PREVIEW_ORDER_ERROR });
        return;
      }
      await placeDhanOrder({
        symbol: pos.symbol,
        name: pos.symbol,
        side: pos.type === "BUY" ? "SELL" : "BUY",
        qty: Math.abs(Number(pos.qty) || 0),
        product: pos.product || "MIS",
        type: "MARKET",
        securityId: pos.securityId,
        exchangeSegment: String(pos.symbol).toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      res.json({ ok: true, live: true, snapshot: snapshot() });
      return;
    }
    const result = squareOff(req.params.id);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ...result, snapshot: snapshot() });
  } catch (error) {
    res.status(error.status || 400).json({ ok: false, error: error.message || "Square off failed" });
  }
});

app.get("/api/report", (_req, res) => {
  res.json(snapshot().report);
});

app.post("/api/chat", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) {
    res.status(400).json({ error: "Message required" });
    return;
  }
  res.json(addChat(text));
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: `${req.method} ${req.originalUrl} was not found. The API on port 4000 is old — stop it and run npm start again.`,
  });
});

const dist = path.join(__dirname, "..", "dist");
const distIndex = path.join(dist, "index.html");
const serveWebsite = fs.existsSync(distIndex);
if (serveWebsite) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(distIndex);
  });
}

app.listen(port, "0.0.0.0", async () => {
  console.log(`T2S API running on http://localhost:${port}`);
  console.log("T2S Dhan orders: send-through (not blocked locally)");
  if (serveWebsite) {
    console.log(`Website is served from this same port. Open http://THIS-SERVER:${port}`);
  } else {
    console.log("Open the website at http://localhost:5173  (not a Cursor preview if you are on your PC)");
  }
  try {
    const publicIp = await thisComputerPublicIpv4();
    if (publicIp) {
      console.log(`Dhan BUY/SELL uses this PC public IPv4: ${publicIp}`);
      console.log("Ignore Vite Network 192.168.x — that is home Wi-Fi only. Dhan does not use it.");
    }
    const booted = await bootDhanFromEnv();
    if (booted) {
      console.log("Dhan live feed started (saved token or PIN + TOTP)");
    } else if (process.env.DHAN_ACCESS_TOKEN) {
      console.log("Dhan env token present but live feed did not start. Check DHAN_CLIENT_ID and token validity.");
    }
    const futs = await resolveFrontFutures();
    const catalog = contractCatalog();
    console.log(
      `Dhan scrip master ready · ${futs.length} front-month futures · ${catalog.counts.futures} FUTIDX · ${catalog.counts.options} OPTIDX`,
    );
    if (!isDhanLive()) {
      await selectOptionDesk({ symbol: "NIFTY" }).catch(() => undefined);
    }
  } catch (error) {
    console.log(`Startup extra step failed (API is still running): ${error.message || error}`);
  }
});
