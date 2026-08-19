import dns from "node:dns";
import net from "node:net";
import { Agent, setGlobalDispatcher } from "undici";

// Dhan static IP is IPv4 only. Node 18+ often dials IPv6, so BUY/SELL
// returns Invalid IP even when 150.129.129.108 is already saved.
dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}
setGlobalDispatcher(new Agent({ connect: { family: 4 } }));

export async function thisComputerPublicIpv4() {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const body = await res.json();
    return String(body.ip || "").trim() || null;
  } catch {
    return null;
  }
}
