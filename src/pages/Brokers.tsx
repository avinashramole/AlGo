import { useMemo, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { formatNumber } from "../lib/format";
import type { BrokerAccount } from "../api/client";

export function Brokers() {
  const { data, connect, disconnect, activate } = useMarket();
  const brokers = data.brokers || [];
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [clientId, setClientId] = useState("demo");
  const [apiKey, setApiKey] = useState("demo123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connectedCount = brokers.filter((item) => item.connected).length;
  const funds = useMemo(
    () => brokers.filter((item) => item.connected).reduce((sum, item) => sum + item.funds, 0),
    [brokers],
  );

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await connect(selected.id, { clientId, apiKey });
      setSelected(null);
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
          Main broker is <b>Dhan</b>. Also connect Zerodha, Kotak Neo, and Fyers.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Connected" value={String(connectedCount)} />
        <Stat label="Active" value={brokers.find((item) => item.active)?.name || "Dhan"} />
        <Stat label="Combined funds" value={`₹${formatNumber(funds, 0)}`} />
      </div>
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
                  </div>
                  <div className="text-xs text-slate-400">
                    {broker.vendor} · {broker.segments.join(", ")} · {broker.mode}
                  </div>
                </div>
              </div>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  broker.connected ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-slate-100 text-slate-500"
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
              {broker.connected ? (
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
                  {broker.id !== "paper" && !broker.main && (
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
                  onClick={() => {
                    setSelected(broker);
                    setError("");
                    setClientId("demo");
                    setApiKey("demo123");
                  }}
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
        Sandbox connect uses your broker-style API key locally. Live OMS routing needs an official app from that broker.
      </p>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="text-sm font-bold">Connect {selected.name}</div>
            <p className="mt-1 text-xs text-slate-400">Sandbox login. Try client ID <b>demo</b> and API key <b>demo123</b>.</p>
            <label className="mt-3 block text-xs font-semibold">
              Client ID
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-xs font-semibold">
              API key / access token
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
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
                {busy ? "Connecting..." : "Connect"}
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
