import { useEffect, useMemo, useState } from "react";
import { useMarket } from "../context/MarketContext";
import { formatNumber, fundsCaption } from "../lib/format";
import { startDhanFeed, type BrokerAccount, type Snapshot } from "../api/client";
import { displaySavedSecret, savedSecretForSubmit } from "../lib/formSecrets";
import { catchDeskError, isTrade2SmartHost } from "../lib/liveSite";

export function Brokers() {
  const { data, connect, enableAuto, refreshToken, disconnect, activate, refresh } = useMarket();
  const brokers = data.brokers || [];
  const feed = data.dhanFeed;
  const [viewId, setViewId] = useState("");
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [dhanClientId, setDhanClientId] = useState("");
  const [dhanToken, setDhanToken] = useState("");
  const [dhanTokenFocused, setDhanTokenFocused] = useState(false);
  const [dhanPin, setDhanPin] = useState("");
  const [dhanTotp, setDhanTotp] = useState("");
  const [kotakMobile, setKotakMobile] = useState("");
  const [kotakMpin, setKotakMpin] = useState("");
  const [kotakTotp, setKotakTotp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const connectedCount = brokers.filter((item) => item.connected).length;
  const dhan = brokers.find((item) => item.id === "dhan");
  const paper = brokers.find((item) => item.id === "paper");
  const defaultBroker = brokers.find((item) => item.active) || brokers.find((item) => item.main) || brokers[0] || null;
  const frontBroker = brokers.find((item) => item.main) || dhan || defaultBroker;
  const actualFunds = dhan?.liveFeed ? dhan.funds : 0;
  const savedDhanClientId = String(feed?.clientId || dhan?.clientId || "").trim();
  const viewed =
    brokers.find((item) => item.id === viewId) || defaultBroker || frontBroker || null;
  const others = brokers.filter((item) => item.id !== viewed?.id);
  const clientLocked = Boolean(selected && selected.id !== "dhan" && (selected.liveFeed || selected.connected));
  const showDhanSettings = viewed?.id === "dhan";
  const showOtherBook = Boolean(viewed && viewed.id !== "dhan");

  useEffect(() => {
    if (dhanClientId) return;
    if (savedDhanClientId) setDhanClientId(savedDhanClientId);
  }, [savedDhanClientId, dhanClientId]);

  useEffect(() => {
    if (!brokers.length) return;
    if (viewId && brokers.some((item) => item.id === viewId)) return;
    setViewId((defaultBroker || frontBroker)?.id || brokers[0].id);
  }, [brokers, defaultBroker, frontBroker, viewId]);

  const openForm = (broker: BrokerAccount) => {
    setSelected(broker);
    setError("");
    if (broker.id === "dhan") {
      setClientId(broker.clientId || feed?.clientId || dhanClientId || "");
      setSecret("");
    } else if (broker.connected) {
      setClientId(broker.clientId || "");
      setSecret("");
    } else {
      setClientId("");
      setSecret("");
      setApiKey("");
      setSessionToken("");
    }
  };

  const pickBroker = (id: string) => {
    const broker = brokers.find((item) => item.id === id);
    if (!broker) return;
    setViewId(id);
    setError("");
    if (broker.connected || broker.id === "dhan") {
      setSelected(null);
    } else {
      openForm(broker);
    }
  };

  const submitDhan = async (id: string, token: string) => {
    await connect("dhan", { clientId: id, accessToken: token, apiKey: token });
    setDhanToken("");
    setDhanTokenFocused(false);
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      if (selected.id === "dhan") {
        await submitDhan(clientId, secret);
      } else {
        await connect(selected.id, {
          clientId,
          apiKey,
          accessToken: secret,
          sessionToken,
          mobile: selected.id === "kotak" ? kotakMobile : undefined,
          mpin: selected.id === "kotak" ? kotakMpin : undefined,
          totpSecret: selected.id === "kotak" ? kotakTotp : undefined,
        });
        setKotakMobile("");
        setKotakMpin("");
        setKotakTotp("");
      }
      setSelected(null);
      setSecret("");
    } catch (err) {
      setError(catchDeskError(err, "Could not connect"));
    } finally {
      setBusy(false);
    }
  };

  const connectDhanAuto = async () => {
    setBusy(true);
    setError("");
    try {
      await enableAuto({
        loginId: dhanClientId || feed?.clientId || "",
        clientId: dhanClientId || feed?.clientId || "",
        pin: dhanPin,
        password: dhanPin,
        totpSecret: dhanTotp,
      });
      setDhanPin("");
      setDhanTotp("");
    } catch (err) {
      setError(catchDeskError(err, "Could not generate token"));
    } finally {
      setBusy(false);
    }
  };

  const changeTokenNow = async () => {
    setBusy(true);
    setError("");
    try {
      await refreshToken({
        loginId: dhanClientId || feed?.clientId || "",
        clientId: dhanClientId || feed?.clientId || "",
        pin: dhanPin,
        password: dhanPin,
        totpSecret: dhanTotp,
      });
      setDhanPin("");
      setDhanTotp("");
    } catch (err) {
      setError(catchDeskError(err, "Could not reset token"));
    } finally {
      setBusy(false);
    }
  };

  const connectDhanCard = async () => {
    const typed = savedSecretForSubmit(dhanToken);
    if (!typed) {
      if (feed?.tokenHint) {
        setError("");
        return;
      }
      setError("Paste the access token.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitDhan(dhanClientId || savedDhanClientId, typed);
    } catch (err) {
      setError(catchDeskError(err, "Could not save the access token"));
    } finally {
      setBusy(false);
    }
  };

  const startSavedFeed = async () => {
    setBusy(true);
    setError("");
    try {
      await startDhanFeed();
      await refresh();
    } catch (err) {
      setError(catchDeskError(err, "Could not start the data feed"));
    } finally {
      setBusy(false);
    }
  };

  const frontLabel = useMemo(() => {
    if (!frontBroker) return "—";
    if (defaultBroker && defaultBroker.id !== frontBroker.id) {
      return `${frontBroker.name} · default ${defaultBroker.name}`;
    }
    return frontBroker.name;
  }, [defaultBroker, frontBroker]);

  return (
    <div className="desk-page flex h-full min-h-0 flex-col gap-2 md:overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Brokers</h1>
          <p className="desk-help text-sm text-slate-400">
            Live brokers: <b>Dhan</b>, Zerodha Kite, Upstox, Fyers, Kotak Neo, and Angel Broking. Connect more than one.
            Set default is the broker used for admin orders and the admin balance. The Dhan data feed can stay on without becoming that default. Connecting a broker does not start LIVE algos.
          </p>
        </div>
        <label className="flex min-w-[12rem] items-center gap-2 text-xs font-semibold">
          Other brokers
          <select
            className="h-9 min-w-[10rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs font-semibold"
            value=""
            onChange={(event) => {
              if (event.target.value) pickBroker(event.target.value);
            }}
          >
            <option value="">{others.length ? "Switch broker" : "No other broker"}</option>
            {others.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.active ? " · DEFAULT" : ""}
                {item.main ? " · MAIN" : ""}
                {item.connected || item.liveFeed ? " · ON" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid shrink-0 gap-2 sm:grid-cols-3">
        <Stat label="Front / default" value={frontLabel} />
        <Stat label="Connected" value={String(connectedCount)} />
        <Stat label="Dhan funds" value={dhan?.liveFeed ? `₹${formatNumber(actualFunds, 0)}` : paper ? fundsCaption(paper) : "—"} />
      </div>
      {viewed ? (
        <section className="card flex min-h-0 flex-1 flex-col p-3 md:overflow-hidden">
          <div className="flex shrink-0 flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-xs font-extrabold text-white"
                style={{ background: viewed.color }}
              >
                {viewed.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-bold">{viewed.name}</div>
                  {viewed.main ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-up dark:bg-emerald-950/40">
                      MAIN
                    </span>
                  ) : null}
                  {viewed.active ? (
                    <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-extrabold text-brand-500">
                      DEFAULT
                    </span>
                  ) : null}
                  {viewed.liveFeed ? (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-extrabold text-up dark:bg-emerald-950/40">
                      LIVE
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-400">
                  {viewed.vendor} · {viewed.segments.join(", ")} · {viewed.mode}
                  {viewed.keyHint ? ` · ${viewed.keyHint}` : ""}
                </div>
              </div>
            </div>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                viewed.liveFeed || viewed.connected
                  ? "bg-emerald-50 text-up dark:bg-emerald-950/40"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {viewed.active ? "DEFAULT" : viewed.status}
            </span>
          </div>

          {showDhanSettings ? (
            <DhanSettings
              broker={viewed}
              feed={feed}
              savedDhanClientId={savedDhanClientId}
              dhanClientId={dhanClientId}
              setDhanClientId={setDhanClientId}
              dhanPin={dhanPin}
              setDhanPin={setDhanPin}
              dhanTotp={dhanTotp}
              setDhanTotp={setDhanTotp}
              dhanToken={dhanToken}
              setDhanToken={setDhanToken}
              dhanTokenFocused={dhanTokenFocused}
              setDhanTokenFocused={setDhanTokenFocused}
              busy={busy}
              error={error}
              onGenerate={() => void connectDhanAuto()}
              onReset={() => void changeTokenNow()}
              onSaveToken={() => void connectDhanCard()}
              onActivate={() => void activate(viewed.id)}
              onStopFeed={() => {
                const last = viewed.clientId || savedDhanClientId;
                void disconnect(viewed.id).then(() => {
                  if (last) setDhanClientId(last);
                });
              }}
              onStartFeed={() => void startSavedFeed()}
            />
          ) : null}

          {showOtherBook ? (
            <div className="mt-3 min-h-0 flex-1 space-y-2">
              {viewed.connected ? (
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <Mini label="Client" value={viewed.clientId || "—"} />
                  <Mini label="Funds" value={fundsCaption(viewed)} />
                  <Mini label="Margin" value={`₹${formatNumber(viewed.marginUsed, 0)}`} />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {viewed.connected && !viewed.active ? (
                  <button
                    type="button"
                    onClick={() => void activate(viewed.id)}
                    className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white"
                  >
                    Set default
                  </button>
                ) : null}
                {viewed.connected && viewed.id !== "paper" ? (
                  <button
                    type="button"
                    onClick={() => void disconnect(viewed.id)}
                    className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold"
                  >
                    Disconnect
                  </button>
                ) : null}
                {viewed.id !== "paper" ? (
                  <button
                    type="button"
                    onClick={() => openForm(viewed)}
                    className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white"
                  >
                    {viewed.connected ? "Update token" : "Connect live"}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <p className="desk-help shrink-0 text-xs text-slate-400">
        Dhan uses DhanHQ <code>POST /v2/orders</code> while LIVE. Zerodha, Upstox, Fyers, Kotak Neo, and Angel Broking
        send real orders to that broker after you connect their token. A rejected broker API is shown as an error — the
        desk does not invent a fill. Restart does not start LIVE algos.
      </p>
      {selected && selected.id !== "dhan" ? (
        <div className="desk-overlay">
          <div className="desk-sheet desk-sheet-sm card p-3">
            <div className="text-sm font-bold">
              {selected.connected ? `Update ${selected.name}` : `Connect ${selected.name} live`}
            </div>
            <p className="desk-help mt-1 text-xs text-slate-400">
              {selected.help || "Paste the live API credentials from that broker. This does not start algos."}
            </p>
            <label className="mt-3 block text-xs font-semibold">
              {selected.id === "angelone" ? "Client code" : selected.id === "zerodha" ? "User ID" : "Client ID"}
              <input
                className={`mt-1 h-10 w-full rounded-lg border border-[var(--border)] px-3 text-sm ${
                  clientLocked ? "cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-[var(--bg)]"
                }`}
                value={clientId}
                onChange={(event) => {
                  if (!clientLocked) setClientId(event.target.value);
                }}
                readOnly={clientLocked}
                placeholder="Client ID"
                autoComplete="off"
              />
            </label>
            {selected.id !== "upstox" ? (
              <label className="mt-3 block text-xs font-semibold">
                {selected.id === "fyers" ? "App ID" : selected.id === "kotak" ? "Consumer key" : "API key"}
                <input
                  className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                />
              </label>
            ) : null}
            <label className="mt-3 block text-xs font-semibold">
              {selected.id === "angelone" ? "JWT token" : "Access token"}
              <input
                type="password"
                className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                autoComplete="off"
              />
            </label>
            {selected.id === "kotak" ? (
              <>
                <label className="mt-3 block text-xs font-semibold">
                  Trade login mobile
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={kotakMobile}
                    onChange={(event) => setKotakMobile(event.target.value.replace(/[^\d+]/g, "").slice(0, 13))}
                    placeholder="+91XXXXXXXXXX"
                    autoComplete="off"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold">
                  MPIN
                  <input
                    type="password"
                    inputMode="numeric"
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={kotakMpin}
                    onChange={(event) => setKotakMpin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Kotak Neo MPIN"
                    autoComplete="off"
                  />
                </label>
                <label className="mt-3 block text-xs font-semibold">
                  TOTP secret
                  <input
                    type="password"
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={kotakTotp}
                    onChange={(event) => setKotakTotp(event.target.value)}
                    placeholder="Setup TOTP secret, or the current 6-digit code"
                    autoComplete="off"
                  />
                </label>
                <p className="desk-help mt-2 text-[11px] leading-snug text-slate-500">
                  Admin orders call Kotak <b>tradeApiLogin</b> with this access token, mobile, client ID, and TOTP, then{" "}
                  <b>tradeApiValidate</b> with the MPIN, then place on the host Kotak returns.
                </p>
                <label className="mt-3 block text-xs font-semibold">
                  Neo sid (optional)
                  <input
                    type="password"
                    className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
                    value={sessionToken}
                    onChange={(event) => setSessionToken(event.target.value)}
                    autoComplete="off"
                  />
                </label>
              </>
            ) : null}
            {error ? <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
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
                {busy ? "Connecting..." : selected.connected ? "Update" : "Connect live"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DhanSettings({
  broker,
  feed,
  savedDhanClientId,
  dhanClientId,
  setDhanClientId,
  dhanPin,
  setDhanPin,
  dhanTotp,
  setDhanTotp,
  dhanToken,
  setDhanToken,
  dhanTokenFocused,
  setDhanTokenFocused,
  busy,
  error,
  onGenerate,
  onReset,
  onSaveToken,
  onActivate,
  onStopFeed,
  onStartFeed,
}: {
  broker: BrokerAccount;
  feed: Snapshot["dhanFeed"];
  savedDhanClientId: string;
  dhanClientId: string;
  setDhanClientId: (value: string) => void;
  dhanPin: string;
  setDhanPin: (value: string) => void;
  dhanTotp: string;
  setDhanTotp: (value: string) => void;
  dhanToken: string;
  setDhanToken: (value: string) => void;
  dhanTokenFocused: boolean;
  setDhanTokenFocused: (value: boolean) => void;
  busy: boolean;
  error: string;
  onGenerate: () => void;
  onReset: () => void;
  onSaveToken: () => void;
  onActivate: () => void;
  onStopFeed: () => void;
  onStartFeed: () => void;
}) {
  return (
    <div className="mt-2 grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,22rem)]">
      <div className="min-h-0 min-w-0 space-y-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-bold">Dhan live feed</div>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold ${
            feed?.live ? "bg-emerald-50 text-up dark:bg-emerald-950/40" : "bg-slate-100 text-slate-500"
          }`}
        >
          {feed?.live ? `DHAN LIVE · ${feed.source}` : feed?.tokenHint ? "TOKEN SAVED" : "WAITING FOR TOKEN"}
        </span>
      </div>
      <p className="desk-help mt-2 text-xs text-slate-400">
        Dhan Access Tokens last <b>24 hours</b> and reset at <b>8:00 AM IST</b>. Login ID is the Dhan{" "}
        <b>Client ID</b>. Password is the 4–6 digit Dhan <b>PIN</b> — not the web.dhan.co website password (Dhan has
        no password token API). A deploy or <b>systemctl restart</b> reconnects the saved access token and turns the
        data feed back on. If Dhan rejects that token, the server calls <b>GET /v2/RenewToken</b>, then PIN + TOTP,
        without a click. The feed stays on until you click <b>Stop data feed</b>. Saving a pasted token does not
        remove it and does not turn strategies LIVE. <b>Reset token now</b> is the same renew, for a cooldown that
        is blocking the automatic one. Save PIN + TOTP once (or set{" "}
        <code>DHAN_CLIENT_ID</code>, <code>DHAN_PIN</code>, <code>DHAN_TOTP_SECRET</code>). A <b>429</b> is a rate
        limit, not an expired token. Setup TOTP on web.dhan.co → My Profile → Access DhanHQ APIs. Paste the{" "}
        <b>secret key</b> from the QR, not the 6-digit code that changes every 30 seconds.
      </p>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Mini label="Token" value={feed?.tokenHint || "not set"} />
        <Mini label="Quotes" value={feed?.live ? String(feed.quoteCount || 0) : "—"} />
        <Mini label="Positions" value={feed?.live ? String(feed.positionCount || 0) : "—"} />
        <Mini
          label="Last tick"
          value={feed?.lastTickAt ? new Date(feed.lastTickAt).toLocaleTimeString("en-IN") : "—"}
        />
        <Mini label="Client ID" value={broker.clientId || savedDhanClientId || "—"} />
        <Mini label="Funds" value={broker.liveFeed ? fundsCaption(broker) : "—"} />
        <Mini
          label="Auto token"
          value={
            feed?.autoMode === "generate" ? "PIN + TOTP · 8:00 AM" : feed?.autoMode === "renew" ? "renew 8:00 AM" : "off"
          }
        />
        <Mini
          label="Token until"
          value={
            feed?.tokenExpiry ? new Date(feed.tokenExpiry).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"
          }
        />
      </div>
      {feed?.ipCheck ? (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <Mini label="Dhan sees" value={feed.ipCheck.detectedIP || "—"} />
          <Mini label="Saved primary" value={feed.ipCheck.primaryIP || "—"} />
          <Mini label="Saved secondary" value={feed.ipCheck.secondaryIP && feed.ipCheck.secondaryIP !== "NA" ? feed.ipCheck.secondaryIP : "—"} />
          <Mini
            label="Orders allowed"
            value={feed.ipCheck.ordersAllowed === true ? "yes" : feed.ipCheck.ordersAllowed === false ? "no" : "—"}
          />
        </div>
      ) : null}
      {feed?.ipCheck?.detectedIP &&
      feed.ipCheck.primaryIP &&
      feed.ipCheck.detectedIP !== feed.ipCheck.primaryIP &&
      feed.ipCheck.detectedIP !== feed.ipCheck.secondaryIP ? (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">
          Dhan saw <b>{feed.ipCheck.detectedIP}</b>, not saved {feed.ipCheck.primaryIP}.{" "}
          {isTrade2SmartHost()
            ? "This is the VPS public IP. Put that IP on Dhan. Do not open localhost."
            : `Keep npm start on this PC and open localhost:5173. Ignore Vite 192.168.x. Do not add another IP if Static IP 1 is already ${feed.ipCheck.primaryIP}.`}
        </div>
      ) : null}
      {feed?.error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{feed.error}</div> : null}
      {feed?.autoMode === "generate" && feed?.needsFresh ? (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Saved token has under 20 minutes left. Click <b>Reset token now</b> once if it does not renew by itself
          {feed?.renewalBlockedUntil
            ? ` (cooldown until ${new Date(feed.renewalBlockedUntil).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })})`
            : ""}
          , then check VPS logs for <code>Dhan token auto-renew</code>.
        </div>
      ) : null}
      </div>
      <div className="min-w-0 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs font-semibold">
          Client ID
          <input
            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={dhanClientId}
            onChange={(event) => setDhanClientId(event.target.value)}
            placeholder={savedDhanClientId || "Dhan client ID"}
            autoComplete="off"
          />
        </label>
        <label className="block text-xs font-semibold">
          PIN
          <input
            type="password"
            inputMode="numeric"
            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={dhanPin}
            onChange={(event) => setDhanPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="4–6 digit PIN"
            autoComplete="off"
          />
        </label>
        <label className="col-span-2 block text-xs font-semibold">
          TOTP secret
          <input
            type="password"
            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={dhanTotp}
            onChange={(event) => setDhanTotp(event.target.value)}
            placeholder="Setup TOTP secret"
            autoComplete="off"
          />
        </label>
        <label className="col-span-2 block text-xs font-semibold">
          Access token
          <input
            type="password"
            className="mt-1 h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"
            value={dhanTokenFocused ? dhanToken : displaySavedSecret(dhanToken, feed?.tokenHint || "")}
            onFocus={() => setDhanTokenFocused(true)}
            onBlur={() => setDhanTokenFocused(false)}
            onChange={(event) => setDhanToken(event.target.value)}
            placeholder={feed?.tokenHint || "24-hour Access Token"}
            autoComplete="off"
          />
        </label>
      </div>
      {error ? <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-down">{error}</div> : null}
      <div className="flex flex-wrap gap-2">
        {!broker.active ? (
          <button type="button" onClick={onActivate} className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white">
            Set default
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Working..." : "Save PIN + TOTP"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onReset}
          className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold disabled:opacity-60"
        >
          Reset token
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSaveToken}
          className="h-9 rounded-lg bg-brand-500 px-4 text-xs font-semibold text-white disabled:opacity-60"
        >
          {busy ? "Saving..." : "Save token"}
        </button>
        {broker.liveFeed ? (
          <button
            type="button"
            disabled={busy}
            onClick={onStopFeed}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold"
          >
            Stop data feed
          </button>
        ) : (
          <button
            type="button"
            disabled={busy || !feed?.tokenHint}
            onClick={onStartFeed}
            className="h-9 rounded-lg border border-[var(--border)] px-4 text-xs font-semibold disabled:opacity-60"
          >
            Start data feed
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-bold">{value}</div>
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
