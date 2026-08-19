import dns from "node:dns";
import https from "node:https";
import net from "node:net";

// Dhan static IP is IPv4 only. Prefer IPv4 so BUY/SELL uses the same
// public IP Chrome shows (150.129.129.108), not IPv6.
dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

/**
 * HTTPS call that always exits this PC over IPv4.
 * Node fetch() can still pick IPv6 even with ipv4first, and Dhan then
 * returns Invalid IP against the IPv4 whitelist.
 */
export function ipv4Request(url, { method = "GET", headers = {}, body, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const payload = body == null ? null : Buffer.from(String(body));
    const nextHeaders = { ...headers };
    if (payload) nextHeaders["Content-Length"] = String(payload.length);

    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: nextHeaders,
        family: 4,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            text: async () => text,
          });
        });
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`IPv4 request timed out: ${target.hostname}`));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Public IPv4 of THIS computer (the one running `npm start`), not the phone/browser. */
export async function thisComputerPublicIpv4() {
  const urls = ["https://api.ipify.org?format=json", "https://ipv4.icanhazip.com"];
  for (const url of urls) {
    try {
      const res = await ipv4Request(url, { timeoutMs: 4000 });
      const raw = String(await res.text()).trim();
      let ip = raw;
      if (raw.startsWith("{")) {
        ip = String(JSON.parse(raw).ip || "").trim();
      }
      if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
    } catch {
      /* try next */
    }
  }
  return null;
}
