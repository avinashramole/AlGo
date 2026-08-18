import cors from "cors";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activateBroker, connectBroker, disconnectBroker, idleDhan, publicBrokers } from "./brokers.js";
import { bootDhanFromEnv, startDhanLive, stopDhanLive } from "./dhan.js";
import {
  addChat,
  applyBrokerPositions,
  assignAlgoBroker,
  dropBrokerPositions,
  getCandles,
  placeOrder,
  snapshot,
  tickMarket,
  toggleAlgo,
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

app.post("/api/algos/:id/toggle", (req, res) => {
  const algo = toggleAlgo(req.params.id);
  if (!algo) {
    res.status(404).json({ error: "Algo not found" });
    return;
  }
  res.json(algo);
});

app.post("/api/algos/:id/broker", (req, res) => {
  const result = assignAlgoBroker(req.params.id, String(req.body?.brokerId || ""));
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json(result);
});

app.post("/api/orders", (req, res) => {
  const order = placeOrder(req.body || {});
  if (order.error) {
    res.status(400).json({ error: order.error });
    return;
  }
  res.status(201).json(order);
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
});
