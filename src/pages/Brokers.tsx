import { useState } from "react";
import { useMarket } from "../context/MarketContext";
import { formatNumber, fundsCaption } from "../lib/format";
import type { BrokerAccount } from "../api/client";

export function Brokers() {
  const { data, connect, enableAuto, refreshToken, disconnect, activate } = useMarket();
  const brokers = data.brokers || [];
  const feed = data.dhanFeed;
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [dhanClientId, setDhanClientId] = useState("");
  const [dhanToken, setDhanToken] = useState("");
  const [dhanPin, setDhanPin] = useState("");
  const [dhanTotp, setDhanTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connectedCount = brokers.filter((item) => item.connected).length;
  const dhan = brokers.find((item) => item.id === "dhan");
  const paper = brokers.find((item) => item.id === "paper");
  const actualFunds = dhan?.liveFeed ? dhan.funds : 0;
  const clientLocked = Boolean(selected?.liveFeed || (selected && selected.id !== "dhan" && selected.connected));

  const openForm = (broker: BrokerAccount) => {
    setSelected(broker);
    setError("");
    if (broker.id === "dhan") {
      setClientId(broker.liveFeed ? broker.clientId || feed?.clientId || "" : dhanClientId || broker.clientId || "");
      setSecret("");
    } else if (broker.connected) {
      setClientId(broker.clientId || "");
      setSecret("");
    } else {
      setClientId("");
      setSecret("");
    }
  };

  const submitDhan = async (id: string, token: string) => {
    await connect("dhan", { clientId: id, accessToken: token, apiKey: token });
    setDhanToken("");
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (selected.id === "dhan") {
        await submitDhan(clientId, secret);
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

  const connectDhanAuto = async () => {
    setBusy(true);
    setError("");
    try {
      await enableAuto({
        clientId: dhanClientId || feed?.clientId || "",
        pin: dhanPin,
        totpSecret: dhanTotp,
      });
      setDhanPin("");
      setDhanTotp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate token");
    } finally {
      setBusy(false);
    }
  };

  const changeTokenNow = async () => {
    setBusy(true);
    setError("");
    try {
      await refreshToken({
        clientId: dhanClientId || feed?.clientId || "",
        pin: dhanPin,
        totpSecret: dhanTotp,
      });
      setDhanPin("");
      setDhanTotp("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change token");
    } finally {
      setBusy(false);
    }
  };

  const connectDhanCard = async () => {
    setBusy(true);
    setError("");
    try {
      await submitDhan(dhanClientId, dhanToken);
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
        <Stat label="Dhan funds (actual)" value={dhan?.liveFeed ? `₹${formatNumber(actualFunds, 0)}` : "—"} />
        <Stat label="Paper funds (virtual)" value={paper ? fundsCaption(paper) : "—"} />
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
          Dhan Access Tokens last <b>24 hours</b>. <b>PIN + TOTP is required on the server</b> to change the token.
          Save them once (or set <code>DHAN_CLIENT_ID</code>, <code>DHAN_PIN</code>, <code>DHAN_TOTP_SECRET</code>). The
          server then calls Dhan <b>generateAccessToken</b> at <b>8:00 AM IST</b> and replaces the live token. Use{" "}
          <b>Change token now</b> for the same server-side call. A <b>429</b> is a rate limit, not an expired token.
          Setup TOTP on web.dhan.co → My Profile → Access DhanHQ APIs. Paste the <b>secret key</b> from the QR, not the
          6-digit code that changes every 30 seconds.
        </p>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
          <Mini label="Token" value={feed?.tokenHint || "not set"} />
          <Mini label="Quotes" value={feed?.live ? String(feed.quoteCount || 0) : "—"} />
          <Mini label="Positions" value={feed?.live ? String(feed.positionCount || 0) : "—"} />
          <Mini
            label="Last tick"
            value={feed?.lastTickAt ? new Date(feed.lastTickAt).toLocaleTimeString("en-IN") : "—"}
          />
          <Mini label="Profile" value={feed?.profileName || feed?.clientId || "—"} />
          <Mini
            label="Auto token"
            value={
              feed?.autoMode === "generate"
                ? "PIN + TOTP · 8:00 AM"
                : feed?.autoMode === "renew"
                  ? "renew 8:00 AM"
                  : "off"
            }
          />
          <Mini
            label="Renews"
            value={
              feed?.nextRenewAt
                ? new Date(feed.nextRenewAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    hour: "2-digit",
                    minute: "2-digit",
                    day: "2-digit",
                    month: "short",
                    hour12: true,
                  })
                : feed?.autoRenew
                  ? "8:00 AM IST"
                  : "—"
            }
          />
          <Mini
            label="Token until"
            value={
              feed?.tokenExpiry
                ? new Date(feed.tokenExpiry).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
                : "—"
            }
          />
        </div>
        {feed?.ipCheck ? (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
            <Mini label="Dhan sees" value={feed.ipCheck.detectedIP || "—"} />
            <Mini label="Saved primary" value={feed.ipCheck.primaryIP || "—"} />
            <Mini label="Saved secondary" value={feed.ipCheck.secondaryIP && feed.ipCheck.secondaryIP !== "NA" ? feed.ipCheck.secondaryIP : "—"} />
            <Mini
              label="Orders allowed"
              value={
                feed.ipCheck.ordersAllowed === true ? "yes" : feed.ipCheck.ordersAllowed === false ? "no" : "—"
              }
            />
          </div>
        ) : null}
        {feed?.ipCheck?.detectedIP &&
        feed.ipCheck.primaryIP &&
        feed.ipCheck.detectedIP !== feed.ipCheck.primaryIP &&
        feed.ipCheck.detectedIP !== feed.ipCheck.secondaryIP ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">
            Dhan saw <b>{feed.ipCheck.detectedIP}</b>, not saved {feed.ipCheck.primaryIP}. Keep{" "}
            <code>npm start</code> on this PC and open localhost:5173. Ignore Vite 192.168.x. Do not add another IP if
            Static IP 1 is already {feed.ipCheck.primaryIP}.
          </div>
        ) : null}
        {feed?.error && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{feed.error}</div>}
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="block text-xs font-semibold">
            Client ID
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
              value={dhanClientId}
              onChange={(event) => setDhanClientId(event.target.value)}
              placeholder={feed?.clientId || "Client ID"}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold">
            Dhan PIN
            <input
              type="password"
              inputMode="numeric"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
              value={dhanPin}
              onChange={(event) => setDhanPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="4–6 digit PIN"
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold">
            TOTP secret key
            <input
              type="password"
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
              value={dhanTotp}
              onChange={(event) => setDhanTotp(event.target.value)}
              placeholder="Setup TOTP secret, not 6-digit code"
              autoComplete="off"
            />
          </label>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-slate-500">
          Use the Dhan app PIN and the long Setup TOTP secret from web.dhan.co — not the 6-digit code that changes every 30 seconds. Invalid TOTP usually means the secret/PIN is wrong, or the VPS clock is off.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void connectDhanAuto()}
            className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Working..." : "Save PIN + TOTP and generate"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void changeTokenNow()}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold disabled:opacity-60"
          >
            {busy ? "Working..." : "Change token now"}
          </button>
        </div>
        {error && selected === null ? (
          <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div>
        ) : null}
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
            {broker.id === "dhan" && broker.liveFeed ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Client" value={broker.clientId || "—"} />
                <Mini label="Funds" value={fundsCaption(broker)} />
                <Mini label="Margin" value={`₹${formatNumber(broker.marginUsed, 0)}`} />
              </div>
            ) : broker.id !== "dhan" && broker.connected ? (
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Mini label="Client" value={broker.clientId || "—"} />
                <Mini label="Funds" value={fundsCaption(broker)} />
                <Mini label="Margin" value={`₹${formatNumber(broker.marginUsed, 0)}`} />
              </div>
            ) : null}
            {broker.id === "dhan" && !broker.liveFeed ? (
              <div className="mt-3 space-y-2">
                <label className="block text-xs font-semibold">
                  Client ID
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={dhanClientId}
                    onChange={(event) => setDhanClientId(event.target.value)}
                    placeholder="Paste Client ID from web.dhan.co"
                    autoComplete="off"
                  />
                </label>
                <label className="block text-xs font-semibold">
                  Access token
                  <input
                    type="password"
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={dhanToken}
                    onChange={(event) => setDhanToken(event.target.value)}
                    placeholder="24-hour Access Token"
                    autoComplete="off"
                  />
                </label>
                {error && selected === null ? (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void connectDhanCard()}
                  className="h-9 w-full rounded-lg bg-brand-500 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {busy ? "Connecting..." : "Connect with access token"}
                </button>
              </div>
            ) : (
            <div className="mt-3 flex gap-2">
              {broker.id === "dhan" ? (
                <>
                  <button
                    type="button"
                    onClick={() => openForm(broker)}
                    className="h-9 flex-1 rounded-lg bg-brand-500 text-xs font-semibold text-white"
                  >
                    Update access token
                  </button>
                  {broker.liveFeed && (
                    <button
                      type="button"
                      onClick={() => {
                        const last = broker.clientId || "";
                        void disconnect(broker.id).then(() => {
                          if (last) setDhanClientId(last);
                        });
                      }}
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
            )}
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
              {selected.id === "dhan" ? "Update Dhan access token" : `Connect ${selected.name}`}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {selected.id === "dhan"
                ? clientLocked
                  ? "Client ID stays on the live Dhan account. Paste a new Access Token only."
                  : "Paste Client ID and Access Token from web.dhan.co → My Profile → Access DhanHQ APIs."
                : "Sandbox login. Enter Client ID and API key. Use demo / demo123 if you do not have an app yet."}
            </p>
            <label className="mt-3 block text-xs font-semibold">
              Client ID
              <input
                className={`mt-1 h-10 w-full rounded-lg border border-[var(--border)] px-3 text-sm ${
                  clientLocked ? "cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-[var(--bg)]"
                }`}
                value={clientId}
                onChange={(event) => {
                  if (!clientLocked) setClientId(event.target.value);
                }}
                readOnly={clientLocked}
                placeholder={selected.id === "dhan" ? "Client ID from web.dhan.co" : "Client ID"}
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
