import dns from "node:dns";
import net from "node:net";

// Dhan static IP is IPv4. Node 18+ often dials IPv6 first, so BUY/SELL
// gets Invalid IP even when the PC's public IPv4 is already whitelisted.
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
