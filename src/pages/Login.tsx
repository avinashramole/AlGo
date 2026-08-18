import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { connectGmail, getGmailStatus } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/format";

const fieldClass = "mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500";

export function Login() {
  const { login, requestOtp, verifyOtp, signup } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<"signin" | "signup">("signin");
  const [method, setMethod] = useState<"password" | "gmail" | "mobile">("password");
  const [channel, setChannel] = useState<"gmail" | "mobile">("gmail");
  const [name, setName] = useState("Segin");
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

  const onSendCode = async (event?: FormEvent) => {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setHint("");
    setDevOtp("");
    try {
      const result = await requestOtp({
        identifier,
        name,
        channel: page === "signin" && method !== "password" ? method : channel,
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

  const onPasswordSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(identifier || "demo@t2s.app", password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const onOtpSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) {
      await onSendCode(event);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await verifyOtp(identifier, otp);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setLoading(false);
    }
  };

  const onSignup = async (event: FormEvent) => {
    event.preventDefault();
    if (!sentTo) {
      await onSendCode(event);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signup({ name, identifier, otp, password, channel });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white">T2</div>
          <div>
            <div className="text-xl font-extrabold">{page === "signup" ? "Sign up" : "Sign in"}</div>
            <div className="text-sm text-slate-400">Trade 2 Smart</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <Tab active={page === "signin"} onClick={() => { setPage("signin"); resetNotice(); }}>Sign in</Tab>
          <Tab active={page === "signup"} onClick={() => { setPage("signup"); setMethod("gmail"); setChannel("gmail"); resetNotice(); }}>Sign up</Tab>
        </div>

        {page === "signin" ? (
          <div className="mb-4 grid grid-cols-3 gap-2">
            <Tab active={method === "password"} onClick={() => { setMethod("password"); resetNotice(); }}>Password</Tab>
            <Tab active={method === "gmail"} onClick={() => { setMethod("gmail"); setChannel("gmail"); resetNotice(); }}>Gmail</Tab>
            <Tab active={method === "mobile"} onClick={() => { setMethod("mobile"); setChannel("mobile"); resetNotice(); }}>Mobile</Tab>
          </div>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            <Tab active={channel === "gmail"} onClick={() => { setChannel("gmail"); resetNotice(); }}>Gmail</Tab>
            <Tab active={channel === "mobile"} onClick={() => { setChannel("mobile"); resetNotice(); }}>Mobile</Tab>
          </div>
        )}

        {(channel === "gmail" && (page === "signup" || method === "gmail")) ? (
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

        {page === "signin" && method === "password" ? (
          <form onSubmit={onPasswordSignIn}>
            <Field label="Gmail or mobile" value={identifier} onChange={setIdentifier} placeholder="you@gmail.com or 98xxxxxxxx" />
            <Field label="Password" value={password} onChange={setPassword} secret />
            <Notice error={error} hint={hint} devOtp={devOtp} />
            <Submit loading={loading} label="Sign in" />
            <p className="mt-4 text-center text-xs text-slate-400">Demo: demo@t2s.app / demo123</p>
          </form>
        ) : null}

        {page === "signin" && method !== "password" ? (
          <form onSubmit={onOtpSignIn}>
            <Field
              label={method === "mobile" ? "Mobile" : "Gmail"}
              value={identifier}
              onChange={(value) => { setIdentifier(value); setSentTo(""); }}
              placeholder={method === "mobile" ? "98xxxxxxxx" : "you@gmail.com"}
            />
            {sentTo ? <Field label="6-digit code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" /> : null}
            <Notice error={error} hint={hint} devOtp={devOtp} />
            <Submit loading={loading} label={sentTo ? "Sign in" : "Send code"} />
            {sentTo ? (
              <button type="button" className="mt-2 h-10 w-full text-sm font-semibold text-brand-500" onClick={() => void onSendCode()}>
                Resend code
              </button>
            ) : null}
          </form>
        ) : null}

        {page === "signup" ? (
          <form onSubmit={onSignup}>
            <Field label="Name" value={name} onChange={setName} placeholder="Segin" />
            <Field
              label={channel === "mobile" ? "Mobile" : "Gmail"}
              value={identifier}
              onChange={(value) => { setIdentifier(value); setSentTo(""); }}
              placeholder={channel === "mobile" ? "98xxxxxxxx" : "you@gmail.com"}
            />
            {sentTo ? (
              <>
                <Field label="6-digit code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                <Field label="Set password (min 6)" value={password} onChange={setPassword} secret />
                <Field label="Confirm password" value={confirm} onChange={setConfirm} secret />
              </>
            ) : null}
            <Notice error={error} hint={hint} devOtp={devOtp} />
            <Submit loading={loading} label={sentTo ? "Create account" : "Send code"} />
            {sentTo ? (
              <button type="button" className="mt-2 h-10 w-full text-sm font-semibold text-brand-500" onClick={() => void onSendCode()}>
                Resend code
              </button>
            ) : null}
            <p className="mt-4 text-center text-xs text-slate-400">Verify Gmail or mobile, set a password, then sign in with password, Gmail, or mobile.</p>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("h-10 rounded-xl text-sm font-semibold", active ? "bg-brand-500 text-white" : "border border-[var(--border)]")}
    >
      {children}
    </button>
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
