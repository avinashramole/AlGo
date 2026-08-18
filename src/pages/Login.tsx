import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";
import "../login.css";

function looksLikeMobile(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
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

  const channel = channelOf(identifier);

  const resetNotice = () => {
    setError("");
    setHint("");
    setDevOtp("");
    setSentTo("");
    setOtp("");
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
    <div className="t2s-login">
      <div className="card t2s-login-card">
        <div className="mb-6 flex justify-center">
          <BrandMark variant="horizontal" size="lg" theme="light" showWordmark="always" />
        </div>

        <form onSubmit={onSubmit} autoComplete="on">
          {page === "signup" ? <Field label="Name" value={name} onChange={setName} placeholder="Your name" autoComplete="name" /> : null}
          <Field
            label="Gmail or mobile"
            value={identifier}
            onChange={(value) => {
              setIdentifier(value);
              setSentTo("");
              setOtp("");
            }}
            placeholder="you@gmail.com or 98xxxxxxxx"
            autoComplete="username"
          />
          {sentTo ? (
            <Field
              label="6-digit code"
              value={otp}
              onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              autoComplete="one-time-code"
            />
          ) : null}
          <Field
            label={page === "signup" ? "Set password" : "Password"}
            value={password}
            onChange={setPassword}
            placeholder={page === "signup" ? "At least 6 characters" : "Enter password"}
            secret
            autoComplete={page === "signup" ? "new-password" : "current-password"}
          />
          {page === "signup" ? (
            <Field label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
          ) : null}
          <Notice error={error} hint={hint} devOtp={devOtp} />
          <button type="submit" disabled={loading} className="mt-1 h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white disabled:opacity-60">
            {loading ? "Please wait..." : page === "signup" ? (sentTo ? "Create account" : "Send code") : "Sign in"}
          </button>
          <button type="button" className="mt-2 h-10 w-full text-sm font-semibold text-brand-500" disabled={loading} onClick={() => void onSendCode()}>
            {sentTo ? "Resend code" : page === "signup" ? "Send code" : "Sign in with code"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-slate-500"
          onClick={() => {
            setPage(page === "signup" ? "signin" : "signup");
            resetNotice();
          }}
        >
          {page === "signup" ? (
            <>
              Have an account? <span className="font-semibold text-slate-900">Sign in</span>
            </>
          ) : (
            <>
              New here? <span className="font-semibold text-slate-900">Create account</span>
            </>
          )}
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
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="mb-3 block text-sm font-semibold">
      {label}
      <span className="mt-1 flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3">
        <input
          className="t2s-input h-11 min-w-0 flex-1 border-0 bg-transparent font-normal outline-none"
          type={secret && !show ? "password" : "text"}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
        />
        {secret ? (
          <button type="button" className="shrink-0 text-xs font-semibold text-brand-500" onClick={() => setShow((current) => !current)}>
            {show ? "Hide" : "Show"}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function Notice({ error, hint, devOtp }: { error: string; hint: string; devOtp: string }) {
  return (
    <>
      {hint ? <p className="mb-3 text-sm text-slate-500">{hint}</p> : null}
      {devOtp ? <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-up">Temporary code: {devOtp}</div> : null}
      {error ? <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-down">{error}</div> : null}
    </>
  );
}
