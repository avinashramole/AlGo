import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activateBroker, connectBroker, disconnectBroker, idleDhan, publicBrokers } from "./brokers.js";
import { bootDhanFromEnv, cancelDhanOrder, isDhanLive, placeDhanOrder, selectOptionDesk, startDhanLive, stopDhanLive } from "./dhan.js";
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

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

setInterval(tickMarket, 1500);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "t2s-api", time: new Date().toISOString() });
});

app.post("/api/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const valid = (email === "demo@t2s.app" || email === "demo") && password === "demo123";

  if (!valid) {
    res.status(401).json({ error: "Use demo@t2s.app / demo123" });
    return;
  }

  res.json({
    token: "t2s-demo-token",
    user: { name: "Avinash", email: "demo@t2s.app", desk: "Index Options" },
  });
});

app.get("/api/snapshot", (_req, res) => {
  res.json(snapshot());
});

app.get("/api/brokers", (_req, res) => {
  res.json(publicBrokers());
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

app.post("/api/algos/:id/backtest", (req, res) => {
  const result = backtestAlgo(req.params.id);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json({ ...result, snapshot: snapshot() });
});

app.post("/api/orders", async (req, res) => {
  const body = req.body || {};
  const brokerId = String(body.brokerId || snapshot().activeBrokerId || "dhan");
  try {
    if (brokerId === "dhan" && isDhanLive()) {
      const live = await placeDhanOrder(body);
      let order = snapshot().orders.find((row) => String(row.id) === String(live.orderId));
      if (!order) {
        order = placeOrder({ ...body, brokerId, live });
        if (order.error) {
          res.status(400).json({ error: order.error });
          return;
        }
      }
      res.status(201).json({ ok: true, live: true, order, snapshot: snapshot() });
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
    res.status(error.status || 400).json({ ok: false, live: false, error: error.message || "Order failed" });
  }
});

app.post("/api/orders/:id/cancel", async (req, res) => {
  try {
    const id = String(req.params.id || "");
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

app.listen(port, "0.0.0.0", async () => {
  console.log(`T2S API running on http://localhost:${port}`);
  const booted = await bootDhanFromEnv();
  if (booted) {
    console.log("Dhan live feed started from DHAN_ACCESS_TOKEN");
  } else if (process.env.DHAN_ACCESS_TOKEN) {
    console.log("Dhan env token present but live feed did not start. Check DHAN_CLIENT_ID and token validity.");
  }
  try {
    const futs = await resolveFrontFutures();
    const catalog = contractCatalog();
    console.log(
      `Dhan scrip master ready · ${futs.length} front-month futures · ${catalog.counts.futures} FUTIDX · ${catalog.counts.options} OPTIDX`,
    );
    await selectOptionDesk({ symbol: "NIFTY" }).catch(() => undefined);
  } catch (error) {
    console.log(`Scrip master not loaded: ${error.message}`);
  }
});
