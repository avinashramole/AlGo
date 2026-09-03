import dns from "node:dns";
import https from "node:https";
import net from "node:net";

// Dhan static IP is IPv4 only. Prefer IPv4 so BUY/SELL uses the same
// public IP Chrome shows (150.129.129.108), not IPv6.
dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

const loggedHosts = new Set();

function lookupIPv4(hostname) {
  return new Promise((resolve, reject) => {
    dns.lookup(hostname, { family: 4, all: false }, (err, address) => {
      if (err) reject(err);
      else resolve(address);
    });
  });
}

/**
 * HTTPS call that connects to the resolved IPv4 address (TLS SNI stays on the hostname).
 * Node fetch() / Happy Eyeballs can still leave over IPv6, which Dhan rejects.
 */
export async function ipv4Request(url, { method = "GET", headers = {}, body, timeoutMs = 20000 } = {}) {
  const target = new URL(url);
  const address = await lookupIPv4(target.hostname);
  if (!loggedHosts.has(target.hostname)) {
    loggedHosts.add(target.hostname);
    console.log(`T2S IPv4 connect ${target.hostname} -> ${address}`);
  }
  const payload = body == null ? null : Buffer.from(String(body));
  const nextHeaders = { Host: target.hostname, ...headers };
  if (payload) nextHeaders["Content-Length"] = String(payload.length);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: address,
        port: Number(target.port) || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: nextHeaders,
        servername: target.hostname,
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
            headers: res.headers || {},
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
