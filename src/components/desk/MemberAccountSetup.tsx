import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  getMemberDesk,
  installMemberBroker,
  requestMemberUpstoxToken,
  selectMemberBroker,
  type MemberDesk,
} from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { isAdminUser } from "../../lib/roles";
import {
  credsAfterInstall,
  hintsFromInstall,
  installValueForSubmit,
  tradingTokenArrived,
} from "../../lib/formSecrets";
import { BrokerInstallFields } from "./BrokerInstallFields";

export const MEMBER_BROKER_CHOICES = [
  { id: "dhan", name: "DHAN" },
  { id: "upstox", name: "UPSTOX" },
  { id: "zerodha", name: "ZERODHA" },
  { id: "kotak", name: "KOTAK" },
  { id: "angelone", name: "ANGELONE" },
  { id: "aliceblue", name: "ALICEBLUE" },
  { id: "sharekhan", name: "SHAREKHAN" },
  { id: "fyers", name: "FYERS" },
  { id: "groww", name: "GROWW" },
  { id: "incred", name: "INCRED" },
  { id: "motilal", name: "MOTILAL" },
  { id: "choice", name: "CHOICE" },
  { id: "delta", name: "DELTA" },
  { id: "coindcx", name: "COINDCX" },
  { id: "binance", name: "BINANCE" },
  { id: "paper", name: "PAPER" },
] as const;

export function isGmailMember(user?: { email?: string; authProvider?: string; role?: "admin" | "user" } | null) {
  if (!user || isAdminUser(user)) return false;
  const email = String(user.email || "").trim().toLowerCase();
  return user.authProvider === "google" || email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
}

export function MemberAccountSetup({ showProfile = true }: { showProfile?: boolean }) {
  const { user, updateProfile } = useAuth();
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [tokenWait, setTokenWait] = useState(false);
  const tokenWaitGen = useRef(0);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upstox") === "connected") {
      setNote("Upstox trading access token saved. Live copy will use this token.");
    }
    if (params.get("upstox") === "error") {
      setError(params.get("message") || "Upstox login failed");
    }
  }, []);

  useEffect(() => {
    if (isAdminUser(user)) return;
    let alive = true;
    void getMemberDesk()
      .then((next) => {
        if (!alive) return;
        setDesk(next);
        setCreds((current) => credsAfterInstall(next.install, current, { keepTyped: true }));
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "Could not load brokers");
      });
    return () => {
      alive = false;
      tokenWaitGen.current += 1;
    };
  }, [user]);

  if (!user || isAdminUser(user)) return null;

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setBusy("profile");
    setError("");
    setNote("");
    try {
      await updateProfile({ name, email, mobile });
      setNote("Profile saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setBusy("");
    }
  };

  const pickBroker = async (brokerId: string) => {
    setBusy(brokerId);
    setError("");
    setNote("");
    setCreds({});
    try {
      const next = await selectMemberBroker(brokerId);
      const deskNext = await getMemberDesk();
      setDesk({ ...deskNext, brokerId: next.brokerId, install: next.install, brokers: next.brokers });
      setCreds((current) => credsAfterInstall(next.install, current));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not select broker");
    } finally {
      setBusy("");
    }
  };

  const saveBroker = async (event: FormEvent) => {
    event.preventDefault();
    if (!desk || desk.brokerId === "paper") return;
    setBusy("broker");
    setError("");
    setNote("");
    try {
      const hints = hintsFromInstall(desk.install);
      const clientId = installValueForSubmit({ id: "clientId" }, creds, hints);
      const result = await installMemberBroker({
        brokerId: desk.brokerId,
        clientId,
        apiKey: installValueForSubmit({ id: "apiKey", secret: true }, creds, hints),
        accessToken: installValueForSubmit({ id: "accessToken", secret: true }, creds, hints),
        sessionToken: installValueForSubmit({ id: "sessionToken", secret: true }, creds, hints),
        mobile: installValueForSubmit({ id: "mobile", secret: true }, creds, hints),
        mpin: installValueForSubmit({ id: "mpin", secret: true }, creds, hints),
        totpSecret: installValueForSubmit({ id: "totpSecret", secret: true }, creds, hints),
      });
      const next = await getMemberDesk();
      setDesk(next);
      setCreds({ clientId: String(result.install?.accountId || clientId || "").trim() });
      setNote(desk.brokerId === "upstox" ? "Upstox credentials saved." : "Broker credentials saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save broker");
    } finally {
      setBusy("");
    }
  };

  const waitForTradingToken = async (
    before: { tokenHint?: string; tokenUpdatedAt?: string; installed?: boolean } | null,
    gen: number,
  ) => {
    setTokenWait(true);
    const deadline = Date.now() + 90_000;
    try {
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        if (gen !== tokenWaitGen.current) return;
        try {
          const next = await getMemberDesk();
          if (gen !== tokenWaitGen.current) return;
          setDesk(next);
          setCreds((current) => credsAfterInstall(next.install, current, { keepTyped: true }));
          if (tradingTokenArrived(before, next.install)) {
            setNote("Trading token saved. Live copy will use this token.");
            return;
          }
        } catch {
          /* keep waiting through a transient desk error */
        }
      }
      if (gen !== tokenWaitGen.current) return;
      setNote("Still waiting for today's trading token. Approve the Upstox app or WhatsApp notification.");
    } finally {
      if (gen === tokenWaitGen.current) setTokenWait(false);
    }
  };

  const requestUpstoxToken = async () => {
    const gen = ++tokenWaitGen.current;
    setBusy("upstox-token");
    setError("");
    setNote("");
    const before = desk?.install
      ? {
          tokenHint: desk.install.tokenHint,
          tokenUpdatedAt: desk.install.tokenUpdatedAt,
          installed: desk.install.installed,
        }
      : null;
    try {
      const result = await requestMemberUpstoxToken();
      if (gen !== tokenWaitGen.current) return;
      setNote(result.message || "Asked Upstox for today's trading token. Approve in the Upstox app.");
      if (result.loginUrl) window.open(result.loginUrl, "_blank", "noopener,noreferrer");
      setBusy("");
      await waitForTradingToken(before, gen);
    } catch (err) {
      if (gen !== tokenWaitGen.current) return;
      setError(err instanceof Error ? err.message : "Could not request Upstox trading token");
    } finally {
      if (gen === tokenWaitGen.current) setBusy("");
    }
  };

  return (
    <section className="card space-y-3 p-4">
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">
          {showProfile ? "Gmail account" : "Account"}
        </div>
        <h2 className="text-base font-extrabold">{showProfile ? "Update profile and add broker" : "Broker"}</h2>
        <p className="desk-help mt-1 text-xs leading-5 text-slate-500">
          {showProfile
            ? "Save your name and mobile, then install the broker this account will trade on."
            : "Pick the broker and save that login. Admin assigns the order IP."}
        </p>
      </div>
      {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-down">{error}</p> : null}
      {note ? <p className="text-xs font-semibold text-slate-500">{note}</p> : null}

      {showProfile ? (
        <form onSubmit={saveProfile} className="grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 sm:grid-cols-3">
          <div className="text-sm font-bold sm:col-span-3">Profile</div>
          <label className="block text-sm font-semibold">
            Name
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-semibold">
            Gmail
            <input className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@gmail.com" />
          </label>
          <label className="block text-sm font-semibold">
            Mobile
            <input
              className="mt-1 h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 text-sm font-normal"
              value={mobile}
              inputMode="numeric"
              maxLength={10}
              placeholder="98xxxxxxxx"
              onChange={(event) => setMobile(event.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </label>
          <button type="submit" disabled={busy === "profile"} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-3">
            {busy === "profile" ? "Saving..." : "Save profile"}
          </button>
        </form>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
        <div className="text-sm font-bold">Add broker</div>
        <p className="desk-help mt-1 text-xs text-slate-500">Pick the broker, then save that broker’s client ID and access token. After a VPS update the data feed starts on its own for users and admin — no restart.</p>
        <label className="mt-3 block text-xs font-semibold">
          Broker
          <select
            data-broker-select="true"
            className="mt-1 h-11 w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--text)]"
            value={desk?.brokerId || "paper"}
            disabled={Boolean(busy)}
            onChange={(event) => void pickBroker(event.target.value)}
          >
            {(desk?.brokers?.length ? desk.brokers : MEMBER_BROKER_CHOICES).map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
                {row.id === (desk?.brokerId || "paper") || ("selected" in row && row.selected) ? " · Active" : ""}
              </option>
            ))}
          </select>
        </label>
        {desk ? (
          <p className="mt-2 text-xs text-slate-500">
            {desk.brokers.find((row) => row.id === desk.brokerId)?.virtual
              ? "Virtual paper"
              : desk.brokers.find((row) => row.id === desk.brokerId)?.installed
                ? "Token saved · Active"
                : "Active · add this broker"}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">Active broker shows in the list. Pick one to use it.</p>
        )}
        {desk && desk.brokerId !== "paper" ? (
          <form className="mt-3" onSubmit={saveBroker}>
            <BrokerInstallFields
              fields={desk.install?.fields || []}
              values={creds}
              hints={hintsFromInstall(desk.install)}
              disabled={busy === "broker"}
              onChange={(id, value) => setCreds((current) => ({ ...current, [id]: value }))}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" disabled={busy === "broker"} className="h-10 rounded-lg bg-brand-500 px-4 text-sm font-semibold text-white disabled:opacity-60">
                {busy === "broker" ? "Saving..." : "Save broker"}
              </button>
              {desk.brokerId === "upstox" ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => void requestUpstoxToken()}
                  className="h-10 rounded-lg border border-brand-500 px-4 text-sm font-semibold text-brand-500 disabled:opacity-60"
                  data-upstox-token="true"
                >
                  {busy === "upstox-token" ? "Asking Upstox..." : tokenWait ? "Waiting for token..." : "Gets Token"}
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
