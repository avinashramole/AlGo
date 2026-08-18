import cors from "cors";
import express from "express";
import { addChat, getCandles, placeOrder, snapshot, tickMarket, toggleAlgo } from "./market.js";

const app = express();
const port = Number(process.env.PORT) || 4000;

app.use(cors({ origin: true }));
app.use(express.json());

setInterval(tickMarket, 1500);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "t2s-api", time: new Date().toISOString() });
});

app.post("/api/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const valid =
    (email === "demo@t2s.app" || email === "demo") && password === "demo123";

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

app.post("/api/orders", (req, res) => {
  res.status(201).json(placeOrder(req.body || {}));
});

app.post("/api/chat", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) {
    res.status(400).json({ error: "Message required" });
    return;
  }
  res.json(addChat(text));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`T2S API running on http://localhost:${port}`);
});
