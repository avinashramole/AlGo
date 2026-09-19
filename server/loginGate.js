import { loadDotEnvFiles } from "./env.js";
import cors from "cors";
import express from "express";
import { attachHttpServerGuards, attachProcessGuards, httpErrorHandler, loginGatePort } from "./httpReady.js";
import { attachLoginRoutes } from "./loginApp.js";

loadDotEnvFiles();
attachProcessGuards();

const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));
attachLoginRoutes(app, { healthService: "t2s-login" });
app.use("/api", (req, res) => {
  res.status(404).json({ error: `${req.method} ${req.originalUrl} is not a login route.` });
});
app.use(httpErrorHandler);

const port = loginGatePort();
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`T2S login gate on http://127.0.0.1:${port} (login stays up if quotes hang)`);
});
attachHttpServerGuards(server, { timeoutMs: 8_000 });
