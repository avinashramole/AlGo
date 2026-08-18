import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { useAuth } from "../context/AuthContext";

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
    <div className="login-shell">
      <div className="login-card">
        <BrandMark />

        <form onSubmit={onSubmit} className="mt-2">
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
            className="login-link mt-2 h-10 w-full text-sm font-semibold"
            disabled={loading}
            onClick={() => void onSendCode()}
          >
            {sentTo ? "Resend code" : page === "signup" ? "Send code" : "Sign in with code"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-center text-sm font-semibold text-slate-400"
          onClick={() => {
            setPage(page === "signup" ? "signin" : "signup");
            resetNotice();
          }}
        >
          {page === "signup" ? "Have an account? Sign in" : "New here? Create account"}
        </button>
        {page === "signin" ? <p className="mt-3 text-center text-xs text-slate-500">Demo: demo@t2s.app / demo123</p> : null}
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
    <label className="login-field">
      <span>{label}</span>
      <input
        className="login-input"
        type={secret ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        autoComplete={secret ? "current-password" : "username"}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Submit({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button type="submit" disabled={loading} className="login-btn">
      {loading ? "Please wait..." : label}
    </button>
  );
}

function Notice({ error, hint, devOtp }: { error: string; hint: string; devOtp: string }) {
  return (
    <>
      {hint ? <p className="mb-3 text-xs font-medium text-slate-400">{hint}</p> : null}
      {devOtp ? <div className="mb-3 rounded-lg border border-[#b6ff3c]/30 bg-[#b6ff3c]/10 px-3 py-2 text-sm font-semibold text-[#b6ff3c]">Temporary code: {devOtp}</div> : null}
      {error ? <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div> : null}
    </>
  );
}
