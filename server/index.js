import { loadDotEnvFiles } from "./env.js";
import { thisComputerPublicIpv4 } from "./ipv4.js";
import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activateBroker, connectBroker, disconnectBroker, idleDhan, isLiveBrokerReady, publicBrokers } from "./brokers.js";
import { placeLiveBrokerOrder } from "./liveBrokers.js";
import { bootDhanFromEnv, cancelDhanOrder, enableDhanAuto, ensureDhanLiveFromSavedToken, fetchDhanHistory, fetchDhanSecurityHistory, isDhanLive, placeDhanOrder, rotateDhanAccessToken, selectOptionDesk, startDhanLive, stopDhanLive } from "./dhan.js";
import { downloadOptionHistoryRange, optionBacktestWindow, optionHistoryCoverage } from "./niftyOptionHistory.js";
import { ensureIndexHistory } from "./indexHistory.js";
import { clearBacktestBusy, extendRequestTimeout, isBacktestBusy, markBacktestBusy } from "./backtestJob.js";
import { adminUpdateUser, connectGmail, gmailStatus, googleOAuthConfigured, listPublicUsers, sessionUser } from "./auth.js";
import { attachLoginRoutes } from "./loginApp.js";
import { abandonEnrollment, claimEnrollmentPaid, deleteEnrollment, dropEnrollmentsWithoutStrategies, enrollStrategy, getPaymentSettings, listCatalog, listEnrollments, markEnrollmentPaid, savePaymentSettings } from "./subscriptions.js";
import { awaitMemberCopySends } from "./liveCopy.js";
import { sendMemberCopyOrder } from "./liveCopySend.js";
import { clientStatus, createClient, deleteClient, getClientDetail, listPositionDesk, saveClient } from "./clients.js";
import {
  addStaticIp,
  assignStaticIp,
  ipManagementStatus,
  removeStaticIp,
  testStaticIp,
  unassignStaticIp,
} from "./ipManagement.js";
import { broadcastMessaging, getThread, messagingStatus, saveMessagingConfig, sendMessaging, upsertMessagingContact } from "./messaging.js";
import { ensurePlanLedger, getMemberDesk, installMemberBroker, listTopups, markTopupPaid, peekBrokerAccount, peekClientSecrets, selectMemberBroker, startMemberDailyBookScheduler, startWalletTopup } from "./memberDesk.js";
import { exchangeUpstoxAuthCode, receiveUpstoxAccessToken, startMemberUpstoxToken, upstoxNotifierUri, upstoxOauthCreds } from "./upstoxAuth.js";
import { memberQuotesForUser } from "./memberQuotesFeed.js";
import { adminLiveOrderPayload } from "./brokerIsolation.js";
import { lookupOptionSecurityId, publicCatalog, resolveFrontFutures } from "./frontFutures.js";
import {
  addChat,
  assignAlgoBroker,
  cancelOrder,
  createAlgo,
  deleteAlgo,
  dropBrokerPositions,
  dropClientFromStrategies,
  getCandles,
  getOptionMeta,
  getAlgo,
  listAlgos,
  quoteSymbol,
  placeOrder,
  snapshot,
  deskFeed,
  deskMtm,
  squareOff,
  tickMarket,
  toggleAlgo,
  armNiftyVwapHedgeDailyLive,
  armNiftyFirstCandleDailyLive,
  updateAlgo,
  backtestAlgo,
  pickBacktestTimeframe,
  resolveBacktestWindow,
  drainPendingLiveAlgoOrders,
  fanOutAdminOrderCopies,
  noteLiveAlgoOrderResult,
  bookRejectedLiveOrder,
  queueLivePositionExit,
  routeManualOrderBrokerId,
} from "./market.js";
import { startFirstCandleDailyLiveScheduler, startHedgeDailyLiveScheduler } from "./niftyVwapHedge/dailyLive.js";
import { startUpstoxDailyTokenScheduler } from "./upstoxDailyToken.js";
import {
  attachHttpServerGuards,
  attachProcessGuards,
  httpErrorHandler,
  sendReadyPage,
  skipDhanBoot,
  skipLiveAlgos,
  withTimeout,
} from "./httpReady.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadDotEnvFiles();

attachProcessGuards();
dropEnrollmentsWithoutStrategies(listAlgos());

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT) || 4000;
const PREVIEW_ORDER_ERROR =
  "Chrome is fine, but this address is a Cursor preview (agent.cvm.dev), not your PC. In the Chrome address bar type exactly http://localhost:5173 and press Enter. Keep npm start running. Do not add another IP.";

function isPreviewRequest(req) {
  const origin = `${req.headers.origin || ""} ${req.headers.referer || ""}`;
  return /cvm\.dev|cursor\.sh|ngrok|trycloudflare|githubpreview|github\.dev/i.test(origin);
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

let flushingLiveAlgos = false;
let flushAgain = false;

async function sendLiveBrokerOrder(payload) {
  const adminPayload = adminLiveOrderPayload(payload);
  const brokerId = String(adminPayload.brokerId || "dhan");
  if (brokerId === "dhan") {
    if (!isDhanLive()) throw Object.assign(new Error("Dhan is not LIVE. Connect Access Token on Brokers."), { status: 400 });
    return placeDhanOrder(adminPayload);
  }
  return placeLiveBrokerOrder(brokerId, adminPayload);
}

async function flushLiveAlgoOrders() {
  if (flushingLiveAlgos) {
    flushAgain = true;
    return;
  }
  const queued = drainPendingLiveAlgoOrders();
  if (!queued.length) return;
  flushingLiveAlgos = true;
  try {
    for (const payload of queued) {
      const brokerId = String(payload.brokerId || "dhan");
      try {
        if (payload.copyUserId) {
          const order = await sendMemberCopyOrder(payload);
          noteLiveAlgoOrderResult(payload, { status: order?.status || "PENDING", orderId: order?.id }, order?.reason);
          continue;
        }
        const live = await sendLiveBrokerOrder(payload);
        const order = placeOrder({ ...payload, brokerId, live, copiedToMembers: true });
        noteLiveAlgoOrderResult(payload, live, order?.error);
        if (order?.error) {
          console.log(`Strategy live fill book: ${order.error}`);
        }
      } catch (error) {
        if (payload.copyUserId) {
          noteLiveAlgoOrderResult(payload, error.live || { status: "REJECTED" }, error);
          console.log(`Member copy order failed: ${error.message || error}`);
          continue;
        }
        const order = bookRejectedLiveOrder({ ...payload, brokerId }, error);
        noteLiveAlgoOrderResult(payload, error.live || { status: "REJECTED" }, error);
        if (order?.error) {
          console.log(`Strategy live fill book: ${order.error}`);
        }
        console.log(`Strategy live order failed: ${error.message || error}`);
      }
    }
  } finally {
    flushingLiveAlgos = false;
    if (flushAgain) {
      flushAgain = false;
      await flushLiveAlgoOrders();
    }
  }
}

function safeSnapshot() {
  try {
    return snapshot();
  } catch (error) {
    console.log(`Desk snapshot failed: ${error.message || error}`);
    return null;
  }
}

attachLoginRoutes(app);

function readToken(req) {
  return String(req.body?.token || req.query?.token || req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function deskGuard(req, res, next) {
  const pathname = String(req.originalUrl || req.url || "").split("?")[0];
  if (
    !pathname.startsWith("/api") ||
    pathname === "/api/health" ||
    pathname === "/api/login" ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/api/auth/otp") ||
    pathname === "/api/auth/reset" ||
    pathname === "/api/auth/signup" ||
    pathname.startsWith("/api/auth/thumb") ||
    pathname === "/api/upstox/token" ||
    pathname === "/api/upstox/callback"
  ) {
    next();
    return;
  }
  const user = sessionUser(readToken(req));
  req.authUser = user;
  if (
    pathname === "/api/me" ||
    pathname === "/api/strategies/catalog" ||
    pathname.startsWith("/api/subscriptions") ||
    pathname.startsWith("/api/member")
  ) {
    next();
    return;
  }
  if (!user) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin only." });
    return;
  }
  next();
}

app.get("/api/strategies/catalog", (req, res) => {
  const user = sessionUser(readToken(req));
  if (!user) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  res.json(listCatalog(listAlgos(), listPublicUsers()));
});

app.get("/api/subscriptions", (req, res) => {
  const user = sessionUser(readToken(req));
  if (!user) {
    res.status(401).json({ error: "Sign in first." });
    return;
  }
  dropEnrollmentsWithoutStrategies(listAlgos());
  res.json({ enrollments: listEnrollments({ userId: user.id, admin: user.role === "admin" }) });
});

app.post("/api/subscriptions/enroll", (req, res) => {
  try {
    const user = sessionUser(readToken(req));
    if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
    const algo = getAlgo(req.body?.strategyId);
    res.status(201).json(enrollStrategy({ user, algo, channel: req.body?.channel, term: req.body?.term, admins: listPublicUsers() }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not enroll" });
  }
});

app.post("/api/subscriptions/:id/claim", (req, res) => {
  try {
    const user = sessionUser(readToken(req));
    if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
    const enrollment = claimEnrollmentPaid({ user, enrollmentId: req.params.id, utr: req.body?.utr });
    res.json({ enrollment });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not claim payment" });
  }
});

app.post("/api/subscriptions/:id/paid", (req, res) => {
  try {
    const user = sessionUser(readToken(req));
    if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
    if (user.role !== "admin") {
      throw Object.assign(new Error("Only an admin can confirm payment. Use I have paid after you transfer."), { status: 403 });
    }
    const enrollment = markEnrollmentPaid({ user, enrollmentId: req.params.id });
    if (enrollment.status === "paid") {
      const owner = { id: enrollment.userId, name: enrollment.userName, email: enrollment.userEmail, role: "user" };
      ensurePlanLedger({ user: owner, algo: getAlgo(enrollment.strategyId) });
    }
    res.json({ enrollment });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not confirm payment" });
  }
});

app.post("/api/subscriptions/:id/abandon", (req, res) => {
  try {
    const user = sessionUser(readToken(req));
    if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
    res.json({ enrollment: abandonEnrollment({ user, enrollmentId: req.params.id }) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not cancel enrollment" });
  }
});

app.delete("/api/subscriptions/:id", (req, res) => {
  try {
    const user = sessionUser(readToken(req));
    if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
    res.json({ enrollment: deleteEnrollment({ user, enrollmentId: req.params.id }) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not delete subscription" });
  }
});

function memberAuth(req) {
  const user = sessionUser(readToken(req));
  if (!user) throw Object.assign(new Error("Sign in first."), { status: 401 });
  return user;
}

app.get("/api/member/quotes", async (req, res) => {
  try {
    const user = memberAuth(req);
    res.json(await memberQuotesForUser(user));
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || "Sign in first." });
  }
});

app.get("/api/member/desk", (req, res) => {
  try {
    const user = memberAuth(req);
    const snap = safeSnapshot() || {};
    dropEnrollmentsWithoutStrategies(listAlgos());
    res.json(
      getMemberDesk({
        user,
        enrollments: listEnrollments({ userId: user.id, admin: false }),
        algos: listAlgos(),
        quote: quoteSymbol,
        admins: listPublicUsers(),
        ownBookOnly: true,
        liveBook: {
          positions: snap.positions || [],
          orders: snap.orders || [],
          closedTrades: snap.closedTrades || [],
        },
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not load member desk" });
  }
});

app.post("/api/member/broker", (req, res) => {
  try {
    res.json(selectMemberBroker({ user: memberAuth(req), brokerId: req.body?.brokerId }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not select broker" });
  }
});

app.get("/api/upstox/token", (_req, res) => {
  res.json({ ok: true, service: "upstox-notifier", notifierUri: upstoxNotifierUri() });
});

app.post("/api/upstox/token", (req, res) => {
  try {
    res.json(receiveUpstoxAccessToken(req.body || {}));
  } catch (error) {
    console.log(`Upstox notifier rejected: ${error.message || error}`);
    res.status(error.status || 400).json({ error: error.message || "Could not save Upstox token" });
  }
});

app.get("/api/upstox/callback", async (req, res) => {
  try {
    const userId = String(req.query?.state || "").trim();
    if (!userId) throw Object.assign(new Error("Upstox login is missing the member state."), { status: 400 });
    const desk = peekClientSecrets(userId);
    const slot = peekBrokerAccount(userId, "upstox");
    const creds = upstoxOauthCreds(slot, desk);
    const minted = await exchangeUpstoxAuthCode({
      code: req.query?.code,
      apiKey: creds.apiKey,
      apiSecret: creds.apiSecret,
    });
    receiveUpstoxAccessToken({
      client_id: creds.apiKey,
      access_token: minted.accessToken,
      user_id: minted.userId,
      expires_at: minted.expiresAt,
    });
    res.redirect(302, "/plans?upstox=connected");
  } catch (error) {
    res.redirect(302, `/plans?upstox=error&message=${encodeURIComponent(error.message || "Upstox login failed")}`);
  }
});

app.post("/api/member/broker/upstox/token", async (req, res) => {
  try {
    res.json(await startMemberUpstoxToken(memberAuth(req)));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not request Upstox trading token" });
  }
});

app.post("/api/member/broker/credentials", (req, res) => {
  try {
    res.json(
      installMemberBroker({
        user: memberAuth(req),
        brokerId: req.body?.brokerId,
        clientId: req.body?.clientId ?? req.body?.accountId,
        apiKey: req.body?.apiKey ?? req.body?.brokerApiKey,
        accessToken: req.body?.accessToken ?? req.body?.brokerToken,
        sessionToken: req.body?.sessionToken ?? req.body?.brokerSessionToken,
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not install broker token" });
  }
});

app.get("/api/member/topups", (req, res) => {
  try {
    const user = memberAuth(req);
    res.json({ topups: listTopups({ userId: user.id, admin: user.role === "admin" }) });
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message || "Sign in first." });
  }
});

app.post("/api/member/wallet/topup", (req, res) => {
  try {
    res.status(201).json(
      startWalletTopup({
        user: memberAuth(req),
        amount: req.body?.amount,
        channel: req.body?.channel,
        admins: listPublicUsers(),
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not start top-up" });
  }
});

app.post("/api/member/wallet/topup/:id/paid", (req, res) => {
  try {
    res.json(markTopupPaid({ user: memberAuth(req), topupId: req.params.id }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not confirm top-up" });
  }
});

app.use(deskGuard);

app.get("/api/users", (_req, res) => {
  res.json({ users: listPublicUsers() });
});

app.post("/api/users/:id", (req, res) => {
  try {
    res.json({ user: adminUpdateUser(req.params.id, req.body || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save user" });
  }
});

app.get("/api/clients", (_req, res) => {
  res.json({
    ...clientStatus(listPublicUsers()),
    strategies: listAlgos().map((row) => ({ id: row.id, name: row.name })),
  });
});

app.get("/api/clients/:id/detail", (req, res) => {
  try {
    const snap = safeSnapshot() || {};
    res.json(
      getClientDetail({
        userId: req.params.id,
        users: listPublicUsers(),
        algos: listAlgos(),
        quote: quoteSymbol,
        admins: listPublicUsers(),
        liveBook: {
          positions: snap.positions || [],
          orders: snap.orders || [],
          closedTrades: snap.closedTrades || [],
        },
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not load client detail" });
  }
});

app.post("/api/clients", (req, res) => {
  try {
    res.status(201).json({ client: createClient(req.body || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not create client" });
  }
});

app.post("/api/clients/:id", (req, res) => {
  try {
    res.json({ client: saveClient(req.params.id, req.body || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save client" });
  }
});

app.delete("/api/clients/:id", (req, res) => {
  try {
    const result = deleteClient(req.params.id, { actorId: req.authUser?.id });
    dropClientFromStrategies(result.id);
    res.json(result);
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not delete client" });
  }
});

app.get("/api/ips", (_req, res) => {
  res.json(ipManagementStatus());
});

app.post("/api/ips", (req, res) => {
  try {
    res.status(201).json(addStaticIp(req.body || {}));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not add static IP" });
  }
});

app.delete("/api/ips/:address", (req, res) => {
  try {
    res.json(removeStaticIp(decodeURIComponent(req.params.address || "")));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not delete static IP" });
  }
});

app.post("/api/ips/:address/test", async (req, res) => {
  try {
    res.json(await testStaticIp(decodeURIComponent(req.params.address || "")));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not test static IP" });
  }
});

app.post("/api/ips/:address/assign", (req, res) => {
  try {
    res.json(assignStaticIp({ address: decodeURIComponent(req.params.address || ""), ...(req.body || {}) }));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not assign static IP" });
  }
});

app.post("/api/ips/unassign", (req, res) => {
  try {
    res.json(unassignStaticIp(req.body || {}));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not unassign static IP" });
  }
});

app.get("/api/payments", (_req, res) => {
  res.json({ payments: getPaymentSettings() });
});

app.post("/api/payments", (req, res) => {
  try {
    const payments = savePaymentSettings(req.body || {});
    const actor = req.authUser || sessionUser(readToken(req));
    if (actor?.id && req.body?.mobile) {
      try {
        adminUpdateUser(actor.id, { mobile: req.body.mobile });
      } catch {
        // Payment number is saved even if the admin profile mobile is already taken.
      }
    }
    res.json({ ok: true, payments });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save payment settings" });
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

app.get("/api/snapshot", (_req, res) => {
  try {
    res.json(snapshot());
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load desk" });
  }
});

app.get("/api/feed", (_req, res) => {
  res.json(deskFeed());
});

app.get("/api/mtm", (_req, res) => {
  try {
    res.json(deskMtm());
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load MTM" });
  }
});

app.get("/api/positions/desk", (_req, res) => {
  try {
    const snap = safeSnapshot() || {};
    res.json(listPositionDesk(listPublicUsers(), snap.positions || [], snap.closedTrades || []));
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not load positions" });
  }
});

app.get("/api/brokers", (_req, res) => {
  res.json(publicBrokers());
});

function dhanLoginFromBody(body = {}) {
  return {
    clientId: body.clientId || body.loginId,
    loginId: body.loginId || body.clientId,
    pin: body.pin || body.password,
    password: body.password || body.pin,
    totpSecret: body.totpSecret || body.totp,
  };
}

app.post("/api/brokers/dhan/auto", async (req, res) => {
  try {
    const result = await enableDhanAuto({
      ...dhanLoginFromBody(req.body),
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

async function handleDhanTokenReset(req, res) {
  try {
    const result = await rotateDhanAccessToken({
      ...dhanLoginFromBody(req.body),
      reason: "api",
    });
    res.json({
      ok: true,
      live: true,
      rotated: true,
      method: result.method || "generate",
      tokenHint: result.tokenHint,
      autoMode: result.autoMode,
      tokenExpiry: result.tokenExpiry,
      nextRenewAt: result.nextRenewAt,
      account: publicBrokers().brokers.find((item) => item.id === "dhan"),
      snapshot: snapshot(),
    });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not reset Dhan token" });
  }
}

app.post("/api/brokers/dhan/refresh", handleDhanTokenReset);
app.post("/api/brokers/dhan/reset", handleDhanTokenReset);

app.post("/api/brokers/:id/connect", async (req, res) => {
  try {
    if (req.params.id === "dhan") {
      const result = await startDhanLive({
        accessToken: req.body?.accessToken || req.body?.apiKey,
        clientId: req.body?.clientId,
        loginId: req.body?.loginId || req.body?.clientId,
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

    const result = await connectBroker(req.params.id, req.body || {});
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ...result, live: true, snapshot: snapshot() });
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
  res.json(getCandles(String(req.query.tf || "5m"), String(req.query.symbol || "NIFTY")));
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
    res.status(error.status || 400).json({ error: error.message || "Option chain failed", snapshot: snapshot() });
  }
});

app.post("/api/algos/:id/toggle", (req, res) => {
  try {
    const current = getAlgo(req.params.id);
    const wantEnabled = req.body?.enabled;
    const starting = current && current.runMode === "live" && !current.enabled && wantEnabled !== false;
    if (starting && !isDhanLive()) {
      res.status(400).json({ error: "Start live needs Dhan LIVE — real CE/PE and futures orders only." });
      return;
    }
    const algo = toggleAlgo(req.params.id, { enabled: wantEnabled });
    if (!algo) {
      res.status(404).json({ error: "Algo not found" });
      return;
    }
    if (algo.error) {
      res.status(400).json({ error: algo.error });
      return;
    }
    res.json({ ok: true, algo, snapshot: null });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not start strategy" });
  }
});

app.post("/api/algos", (req, res) => {
  try {
    const algo = createAlgo(req.body || {});
    res.status(201).json({ ok: true, algo, snapshot: null });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save strategy" });
  }
});

app.put("/api/algos/:id", (req, res) => {
  try {
    const result = updateAlgo(req.params.id, req.body || {});
    if (result.error) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, algo: result, snapshot: null });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save strategy" });
  }
});

app.delete("/api/algos/:id", (req, res) => {
  try {
    const result = deleteAlgo(req.params.id);
    if (result.error) {
      res.status(404).json({ error: result.error });
      return;
    }
    res.json({ ok: true, ...result, snapshot: null });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not delete strategy" });
  }
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
  if (isBacktestBusy()) {
    res.status(429).json({ error: "A backtest is already running. Wait for it to finish." });
    return;
  }
  extendRequestTimeout(req, 180_000);
  markBacktestBusy();
  const heartbeat = setInterval(() => markBacktestBusy(), 20_000);
  if (typeof heartbeat.unref === "function") heartbeat.unref();
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
    let candleSource = "";
    let reused = false;
    try {
      const packed = await ensureIndexHistory({
        symbol: algo.symbol,
        from: window.from,
        to: window.to,
        timeframe,
        overwrite: false,
        fetchRange: isDhanLive()
          ? (args) =>
              fetchDhanHistory({
                symbol: args.symbol,
                from: args.from,
                to: args.to,
                timeframe: args.timeframe,
              })
          : undefined,
      });
      candles = packed.candles || [];
      candleSource = packed.source || "";
      reused = Boolean(packed.reused);
    } catch {
      candles = [];
    }
    const hist = optionBacktestWindow(algo, window);
    let optionHistory;
    const optionCoverage = hist.option ? optionHistoryCoverage(hist.symbol || algo.symbol, hist.from, hist.to) : "synth";
    if (hist.option && candles.length >= 40 && optionCoverage !== "stored") {
      if (isDhanLive()) {
        try {
          optionHistory = await downloadOptionHistoryRange({
            symbol: hist.symbol || algo.symbol,
            from: hist.from,
            to: hist.to,
            candles,
            overwrite: false,
            fetchBars: fetchDhanSecurityHistory,
            lookupId: lookupOptionSecurityId,
            delayMs: 40,
          });
        } catch (error) {
          optionHistory = { error: error.message || "option-history-failed" };
        }
      }
    } else if (hist.option && optionCoverage === "stored") {
      optionHistory = { source: "stored", reused: true, days: 0, overwritten: [] };
    }
    const result = await backtestAlgo(id, {
      range: window.range,
      from: window.from,
      to: window.to,
      candles,
      optionHistory,
      candleSource,
      reused,
    });
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ...result, snapshot: null });
  } catch (error) {
    res.status(400).json({ error: error.message || "Backtest failed" });
  } finally {
    clearInterval(heartbeat);
    clearBacktestBusy();
  }
});

app.post("/api/orders", async (req, res) => {
  const body = req.body || {};
  const brokerId = routeManualOrderBrokerId(body, {
    dhanLive: isDhanLive(),
    activeBrokerId: snapshot().activeBrokerId,
  });
  try {
    if ((brokerId === "dhan" && isDhanLive()) || (brokerId !== "paper" && isLiveBrokerReady(brokerId))) {
      if (isPreviewRequest(req)) {
        res.status(400).json({ ok: false, live: false, error: PREVIEW_ORDER_ERROR });
        return;
      }
      const live = await sendLiveBrokerOrder({ ...body, brokerId });
      let order = snapshot().orders.find((row) => String(row.id) === String(live.orderId));
      if (!order) {
        order = placeOrder({ ...body, brokerId, live });
        if (order.error) {
          res.status(400).json({ error: order.error });
          return;
        }
      } else {
        fanOutAdminOrderCopies({ ...body, brokerId, live }, order);
      }
      await awaitMemberCopySends();
      await flushLiveAlgoOrders();
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
    await awaitMemberCopySends();
    await flushLiveAlgoOrders();
    res.status(201).json({
      ok: true,
      live: false,
      warning:
        brokerId === "paper"
          ? undefined
          : `Order stayed on the T2S desk. ${brokerId} is not LIVE — connect it on Brokers first.`,
      order,
      snapshot: snapshot(),
    });
  } catch (error) {
    const booked = brokerId === "dhan" ? bookRejectedLiveOrder({ ...body, brokerId }, error) : null;
    if (booked && !booked.error) {
      await awaitMemberCopySends();
      await flushLiveAlgoOrders();
      res.status(201).json({
        ok: false,
        live: true,
        error: String(error.message || "Dhan received this order and rejected it."),
        order: booked,
        snapshot: snapshot(),
      });
      return;
    }
    res.status(error.status || 400).json({
      ok: false,
      live: Boolean(error.live),
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
      const queued = queueLivePositionExit(pos);
      if (queued?.error) {
        res.status(400).json({ error: queued.error });
        return;
      }
      await flushLiveAlgoOrders();
      res.json({ ok: true, live: true, queued: true, snapshot: snapshot() });
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

app.get("/api/messaging", (_req, res) => {
  res.json(messagingStatus(listPublicUsers()));
});

app.post("/api/messaging/config", (req, res) => {
  try {
    res.json(saveMessagingConfig(req.body || {}));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save messaging" });
  }
});

app.post("/api/messaging/contacts", (req, res) => {
  try {
    res.status(201).json({ contact: upsertMessagingContact(req.body || {}) });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Could not save contact" });
  }
});

app.get("/api/messaging/thread/:id", (req, res) => {
  res.json({ messages: getThread(req.params.id) });
});

app.post("/api/messaging/send", async (req, res) => {
  try {
    res.json(
      await sendMessaging({
        contactId: req.body?.contactId,
        text: req.body?.text,
        via: req.body?.via,
        users: listPublicUsers(),
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Send failed" });
  }
});

app.post("/api/messaging/broadcast", async (req, res) => {
  try {
    res.json(
      await broadcastMessaging({
        text: req.body?.text,
        via: req.body?.via,
        users: listPublicUsers(),
      }),
    );
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "Broadcast failed" });
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({
    error: `${req.method} ${req.originalUrl} was not found. The API on port 4000 is old — stop it and run npm start again.`,
  });
});

const dist = path.join(__dirname, "..", "dist");
const distIndex = path.join(dist, "index.html");
const serveWebsite = fs.existsSync(distIndex);

app.get(["/", "/index.html"], (_req, res) => {
  sendReadyPage(res, serveWebsite ? distIndex : "");
});

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
    sendReadyPage(res, distIndex);
  });
}

app.use(httpErrorHandler);

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`T2S API running on http://localhost:${port}`);
  if (googleOAuthConfigured()) {
    console.log(`Google login ready. Callback ${googleRedirectUri(process.env)}`);
  } else {
    console.log("Google login off. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env");
  }
  console.log("T2S Dhan orders: send-through (not blocked locally)");
  if (skipLiveAlgos()) {
    console.log("LIVE algo ticks off on this process (T2S_SKIP_LIVE_ALGOS). Login and quotes still run.");
  }
  if (serveWebsite) {
    console.log(`Website is served from this same port. Open http://THIS-SERVER:${port}`);
  } else {
    console.log("Open the website at http://localhost:5173  (not a Cursor preview if you are on your PC)");
  }
  const bootDelay = Number(process.env.T2S_DHAN_BOOT_DELAY_MS || 4000);
  const waitBoot = Number.isFinite(bootDelay) && bootDelay >= 0 ? bootDelay : 4000;
  if (waitBoot === 0) {
    void bootBackground();
  } else {
    console.log(`Dhan boot starts in ${waitBoot}ms so /api/login can answer first`);
    setTimeout(() => {
      void bootBackground();
    }, waitBoot);
  }
  startDeskTimers();
});
attachHttpServerGuards(server);

function startDeskTimers() {
  if (/^(1|true|yes)$/i.test(String(process.env.T2S_SKIP_TICK || ""))) {
    console.log("Desk ticks skipped (T2S_SKIP_TICK). API is answering on this port.");
    return;
  }
  const delay = Number(process.env.T2S_TICK_DELAY_MS || 8000);
  const wait = Number.isFinite(delay) && delay >= 0 ? delay : 8000;
  const kick = () => {
    setInterval(() => {
      try {
        tickMarket();
      } catch (error) {
        console.error(`tickMarket failed: ${error.message || error}`);
      }
    }, 1500);
    setInterval(() => {
      void flushLiveAlgoOrders();
    }, 1500);
  };
  if (wait === 0) {
    kick();
    return;
  }
  console.log(`Desk ticks start in ${wait}ms so /api/health can answer first`);
  setTimeout(kick, wait);
}

async function bootBackground() {
  startUpstoxDailyTokenScheduler();
  startMemberDailyBookScheduler();
  if (skipLiveAlgos()) {
    console.log("NIFTY daily LIVE schedulers off (T2S_SKIP_LIVE_ALGOS). Login stays answering.");
  } else {
    startFirstCandleDailyLiveScheduler({
      arm: async () => {
        if (!isDhanLive()) {
          const dhan = await ensureDhanLiveFromSavedToken();
          if (!dhan.live) {
            console.log(`NIFTY 5m first candle 09:00 LIVE arm waiting for Dhan (${dhan.reason || "not-live"})`);
          }
        }
        let result = armNiftyFirstCandleDailyLive();
        if (result.reason === "dhan-not-live") {
          const dhan = await ensureDhanLiveFromSavedToken();
          if (dhan.live) result = armNiftyFirstCandleDailyLive();
        }
        return result;
      },
    });
    startHedgeDailyLiveScheduler({
      arm: async () => {
        if (!isDhanLive()) {
          const dhan = await ensureDhanLiveFromSavedToken();
          if (!dhan.live) {
            console.log(`NIFTY 15m VWAP 09:20 LIVE arm waiting for Dhan (${dhan.reason || "not-live"})`);
          }
        }
        let result = armNiftyVwapHedgeDailyLive();
        if (result.reason === "dhan-not-live") {
          const dhan = await ensureDhanLiveFromSavedToken();
          if (dhan.live) result = armNiftyVwapHedgeDailyLive();
        }
        return result;
      },
    });
  }
  if (skipDhanBoot()) {
    console.log("Dhan boot skipped (T2S_SKIP_DHAN_BOOT). API is answering on this port.");
    return;
  }
  try {
    const publicIp = await thisComputerPublicIpv4();
    if (publicIp) {
      console.log(`Dhan BUY/SELL uses this PC public IPv4: ${publicIp}`);
      console.log("Ignore Vite Network 192.168.x — that is home Wi-Fi only. Dhan does not use it.");
    }
    const booted = await withTimeout(bootDhanFromEnv(), 20_000, "Dhan boot timed out after 20s");
    if (booted) {
      console.log("Dhan live feed started (saved token or PIN + TOTP)");
    } else if (process.env.DHAN_ACCESS_TOKEN) {
      console.log("Dhan env token present but live feed did not start. Check DHAN_CLIENT_ID and token validity.");
    }
  } catch (error) {
    console.log(`Startup extra step failed (API is still running): ${error.message || error}`);
  }
}
