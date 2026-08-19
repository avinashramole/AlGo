import dns from "node:dns";
import net from "node:net";

// Dhan static IP is IPv4 only. Prefer IPv4 so BUY/SELL uses the same
// public IP Chrome shows (150.129.129.108), not IPv6.
dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

export async function thisComputerPublicIpv4() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const body = await res.json();
    return String(body.ip || "").trim() || null;
  } catch {
    return null;
  }
}
