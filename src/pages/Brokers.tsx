import { useMemo, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { formatNumber } from "../lib/format";
import type { BrokerAccount } from "../api/client";

export function Brokers() {
  const { data, connect, disconnect, activate } = useMarket();
  const brokers = data.brokers || [];
  const feed = data.dhanFeed;
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connectedCount = brokers.filter((item) => item.connected).length;
  const funds = useMemo(
    () => brokers.filter((item) => item.connected).reduce((sum, item) => sum + item.funds, 0),
    [brokers],
  );

  const openForm = (broker: BrokerAccount) => {
    setSelected(broker);
    setError("");
    if (broker.id === "dhan") {
      setClientId(broker.clientId || feed?.clientId || "");
      setSecret("");
    } else {
      setClientId("demo");
      setSecret("demo123");
    }
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (selected.id === "dhan") {
        await connect("dhan", { clientId, accessToken: secret, apiKey: secret });
      } else {
        await connect(selected.id, { clientId, apiKey: secret });
      }
      setSelected(null);
      setSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Brokers</h1>
        <p className="text-sm text-slate-400">
          Main broker is <b>Dhan</b>. BUY/SELL hits Dhan only while the Access Token is LIVE. Dhan order APIs also need
          a static IP whitelist on web.dhan.co.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Connected" value={String(connectedCount)} />
        <Stat label="Active" value={brokers.find((item) => item.active)?.name || "Dhan"} />
        <Stat label="Combined funds" value={`₹${formatNumber(funds, 0)}`} />
      </div>
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm font-bold">Dhan live feed</div>
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
              feed?.live ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-slate-100 text-slate-500"
            }`}
          >
            {feed?.live ? `DHAN LIVE · ${feed.source}` : "WAITING FOR TOKEN"}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Open <b>web.dhan.co</b> → My Profile → Access DhanHQ APIs. Copy Client ID and the 24-hour Access Token.
          Quotes start as soon as the token is live. LIVE mode shows only real Dhan quotes, orders, and positions — no
          demo fills. Until then BUY/SELL stays on this desk. The token stays on this computer and is never saved in git.
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-5">
          <Mini label="Token" value={feed?.tokenHint || "not set"} />
          <Mini label="Quotes" value={feed?.live ? String(feed.quoteCount || 0) : "—"} />
          <Mini label="Positions" value={feed?.live ? String(feed.positionCount || 0) : "—"} />
          <Mini
            label="Last tick"
            value={feed?.lastTickAt ? new Date(feed.lastTickAt).toLocaleTimeString("en-IN") : "—"}
          />
          <Mini label="Profile" value={feed?.profileName || feed?.clientId || "—"} />
        </div>
        {feed?.error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{feed.error}</div>}
      </section>
      <div className="grid gap-3 lg:grid-cols-2">
        {brokers.map((broker) => (
          <section key={broker.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold text-white"
                  style={{ background: broker.color }}
                >
                  {broker.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-bold">{broker.name}</div>
                    {broker.main && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-up dark:bg-emerald-950/40">
                        MAIN
                      </span>
                    )}
                    {broker.liveFeed && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-up dark:bg-emerald-950/40">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {broker.vendor} · {broker.segments.join(", ")} · {broker.mode}
                    {broker.keyHint ? ` · ${broker.keyHint}` : ""}
                  </div>
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  broker.liveFeed || broker.connected
                    ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {broker.active ? "ACTIVE" : broker.status}
              </span>
            </div>
            {broker.connected && (
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Client" value={broker.clientId || "—"} />
                <Mini label="Funds" value={`₹${formatNumber(broker.funds, 0)}`} />
                <Mini label="Margin" value={`₹${formatNumber(broker.marginUsed, 0)}`} />
              </div>
            )}
            <div className="mt-3 flex gap-2">
              {broker.id === "dhan" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openForm(broker)}
                    className="h-9 flex-1 rounded-lg bg-brand-500 text-xs font-semibold text-white"
                  >
                    {broker.liveFeed ? "Update access token" : "Connect live feed"}
                  </button>
                  {broker.liveFeed && (
                    <button
                      type="button"
                      onClick={() => void disconnect(broker.id)}
                      className="h-9 flex-1 rounded-lg border border-[var(--border)] text-xs font-semibold"
                    >
                      Stop live feed
                    </button>
                  )}
                </>
              ) : broker.connected ? (
                <>
                  {!broker.active && (
                    <button
                      type="button"
                      onClick={() => void activate(broker.id)}
                      className="h-9 flex-1 rounded-lg bg-brand-500 text-xs font-semibold text-white"
                    >
                      Set active
                    </button>
                  )}
                  {broker.id !== "paper" && (
                    <button
                      type="button"
                      onClick={() => void disconnect(broker.id)}
                      className="h-9 flex-1 rounded-lg border border-[var(--border)] text-xs font-semibold"
                    >
                      Disconnect
                    </button>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => openForm(broker)}
                  className="h-9 w-full rounded-lg bg-brand-500 text-xs font-semibold text-white"
                >
                  Connect sandbox
                </button>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Dhan uses the official Access Token. BUY/SELL is sent to DhanHQ <code>POST /v2/orders</code> only while LIVE.
        If Dhan rejects the order (IP not whitelisted, invalid token, or missing security ID), the desk shows that error
        and does not invent a fill. Zerodha / Kotak / Fyers stay sandbox (demo / demo123) until those apps are approved.
      </p>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="text-sm font-bold">
              {selected.id === "dhan" ? "Connect Dhan live feed" : `Connect ${selected.name}`}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selected.id === "dhan"
                ? "Paste Client ID and Access Token from web.dhan.co → My Profile → Access DhanHQ APIs."
                : "Sandbox login. Try client ID demo and API key demo123."}
            </p>
            <label className="mt-3 block text-xs font-semibold">
              Client ID
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="mt-3 block text-xs font-semibold">
              {selected.id === "dhan" ? "Access token" : "API key / access token"}
              <input
                type="password"
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
              />
            </label>
            {error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setSelected(null)} className="h-10 flex-1 rounded-xl border border-[var(--border)] text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void submit()}
                className="h-10 flex-1 rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Connecting..." : selected.id === "dhan" ? "Start live feed" : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--bg)] px-2 py-2">
      <div className="text-[10px] uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-semibold">{value}</div>
    </div>
  );
}
