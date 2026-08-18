import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { connectGmail, getGmailStatus } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/format";

const fieldClass = "mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500";

function looksLikeMobile(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
}

function looksLikeGmail(value: string) {
  return /@gmail\.com$|@googlemail\.com$/i.test(String(value || "").trim());
}

function channelOf(value: string): "gmail" | "mobile" {
  return looksLikeMobile(value) ? "mobile" : "gmail";
}

export function Login() {
  const { login, requestOtp, verifyOtp, signup } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mailConnected, setMailConnected] = useState(false);
  const [mailFrom, setMailFrom] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");

  const channel = channelOf(identifier);
  const showGmail = looksLikeGmail(identifier);

  useEffect(() => {
    void getGmailStatus()
      .then((row) => {
        setMailConnected(Boolean(row.connected));
        setMailFrom(row.user || "");
      })
      .catch(() => undefined);
  }, []);

  const resetNotice = () => {
    setError("");
    setHint("");
    setDevOtp("");
    setSentTo("");
    setOtp("");
  };

  const onConnectGmail = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await connectGmail(senderEmail, appPassword);
      setMailConnected(Boolean(result.connected));
      setMailFrom(result.user || senderEmail);
      setAppPassword("");
      setHint("Gmail connected. Codes and login mail will go to the inbox.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect Gmail");
    } finally {
      setLoading(false);
    }
  };

  const onSendCode = async () => {
    setLoading(true);
    setError("");
    setHint("");
    setDevOtp("");
    try {
      const result = await requestOtp({
        identifier,
        name,
        channel,
        purpose: page === "signup" ? "signup" : "login",
      });
      setSentTo(result.to || identifier);
      setHint(result.hint || "Enter the 6-digit code.");
      setDevOtp(result.devOtp || "");
      if (result.gmail) {
        setMailConnected(Boolean(result.gmail.connected));
        setMailFrom(result.gmail.user || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (page === "signup") {
      if (!sentTo) {
        await onSendCode();
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setLoading(true);
      try {
        await signup({ name, identifier, otp, password, channel });
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign up failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (otp.length === 6) {
      setLoading(true);
      try {
        await verifyOtp(identifier, otp);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify code");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (password) {
      setLoading(true);
      try {
        await login(identifier || "demo@t2s.app", password);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign in failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    await onSendCode();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white">T2</div>
          <div className="text-xl font-extrabold">Trade 2 Smart</div>
        </div>

        {showGmail ? (
          <GmailBox
            connected={mailConnected}
            from={mailFrom}
            senderEmail={senderEmail}
            appPassword={appPassword}
            loading={loading}
            onSender={setSenderEmail}
            onPass={setAppPassword}
            onSubmit={onConnectGmail}
          />
        ) : null}

        <form onSubmit={onSubmit}>
          {page === "signup" ? <Field label="Name" value={name} onChange={setName} placeholder="Your name" /> : null}
          <Field
            label="Gmail or mobile"
            value={identifier}
            onChange={(value) => {
              setIdentifier(value);
              setSentTo("");
              setOtp("");
            }}
            placeholder="you@gmail.com or 98xxxxxxxx"
          />
          {sentTo ? (
            <Field label="6-digit code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
          ) : null}
          <Field label={page === "signup" ? "Set password (min 6)" : "Password"} value={password} onChange={setPassword} secret />
          {page === "signup" ? <Field label="Confirm password" value={confirm} onChange={setConfirm} secret /> : null}
          <Notice error={error} hint={hint} devOtp={devOtp} />
          <Submit loading={loading} label={page === "signup" ? (sentTo ? "Create account" : "Send code") : "Sign in"} />
          <button
            type="button"
            className="mt-2 h-10 w-full text-sm font-semibold text-brand-500"
            disabled={loading}
            onClick={() => void onSendCode()}
          >
            {sentTo ? "Resend code" : page === "signup" ? "Send code" : "Sign in with code"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm font-semibold text-slate-500"
          onClick={() => {
            setPage(page === "signup" ? "signin" : "signup");
            resetNotice();
          }}
        >
          {page === "signup" ? "Have an account? Sign in" : "New here? Create account"}
        </button>
        {page === "signin" ? <p className="mt-3 text-center text-xs text-slate-400">Demo: demo@t2s.app / demo123</p> : null}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
}) {
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <input className={fieldClass} type={secret ? "password" : "text"} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Submit({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60">
      {loading ? "Please wait..." : label}
    </button>
  );
}

function Notice({ error, hint, devOtp }: { error: string; hint: string; devOtp: string }) {
  return (
    <>
      {hint ? <p className="mb-3 text-xs font-medium text-slate-500">{hint}</p> : null}
      {devOtp ? <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-950/40">Temporary code: {devOtp}</div> : null}
      {error ? <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-down dark:bg-rose-950/40">{error}</div> : null}
    </>
  );
}

function GmailBox({
  connected,
  from,
  senderEmail,
  appPassword,
  loading,
  onSender,
  onPass,
  onSubmit,
}: {
  connected: boolean;
  from: string;
  senderEmail: string;
  appPassword: string;
  loading: boolean;
  onSender: (value: string) => void;
  onPass: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className={cn("mb-4 rounded-xl border p-3", connected ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-amber-200 bg-amber-50/80 dark:border-amber-900 dark:bg-amber-950/30")}>
      {connected ? (
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Gmail sending from {from}.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">Connect Gmail (App Password) to email login codes and notices.</p>
          <input className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={senderEmail} onChange={(event) => onSender(event.target.value)} placeholder="Desk Gmail" />
          <input type="password" className="h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm" value={appPassword} onChange={(event) => onPass(event.target.value)} placeholder="App Password" />
          <button type="submit" disabled={loading} className="h-9 w-full rounded-lg bg-slate-900 text-xs font-semibold text-white dark:bg-white dark:text-slate-900">
            Connect Gmail
          </button>
        </form>
      )}
    </div>
  );
}
