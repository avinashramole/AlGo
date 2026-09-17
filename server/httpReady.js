const READY_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Trade 2 Smart</title>
  </head>
  <body style="margin:0;font-family:sans-serif;background:#1d39c4;color:#fff;padding:32px">
    <h1>Trade 2 Smart</h1>
    <p>API is up on this port.</p>
  </body>
</html>
`;

export function skipDhanBoot(env = process.env) {
  return /^(1|true|yes)$/i.test(String(env.T2S_SKIP_DHAN_BOOT || ""));
}

export function withTimeout(task, ms, message) {
  const timeoutMs = Number(ms);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return task;
  return Promise.race([
    task,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message || `Timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export function attachHttpServerGuards(server, { timeoutMs = 20_000 } = {}) {
  const wait = Number(timeoutMs) || 20_000;
  server.timeout = wait;
  server.headersTimeout = wait + 2_000;
  server.keepAliveTimeout = 5_000;
  server.requestTimeout = wait;
  server.on("error", (error) => {
    console.error(`HTTP listen error: ${error.message || error}`);
  });
  server.on("clientError", (_error, socket) => {
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    } catch {
      try {
        socket.destroy();
      } catch {
        /* already closed */
      }
    }
  });
  return server;
}

export function attachProcessGuards() {
  if (globalThis.__t2sProcessGuards) return;
  globalThis.__t2sProcessGuards = true;
  process.on("uncaughtException", (error) => {
    console.error(`uncaughtException (API kept running): ${error?.stack || error}`);
  });
  process.on("unhandledRejection", (error) => {
    console.error(`unhandledRejection (API kept running): ${error?.stack || error}`);
  });
}

export function sendReadyPage(res, distIndex) {
  if (distIndex) {
    res.sendFile(distIndex, (error) => {
      if (!error || res.headersSent) return;
      res.status(200).type("html").send(READY_HTML);
    });
    return;
  }
  res.status(200).type("html").send(READY_HTML);
}

export function httpErrorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }
  console.error(`HTTP ${req.method} ${req.originalUrl} failed: ${error?.message || error}`);
  const url = String(req.originalUrl || req.path || "");
  if (url.startsWith("/api")) {
    res.status(500).json({ error: "Server error" });
    return;
  }
  res.status(200).type("html").send(READY_HTML);
}

export { READY_HTML };
