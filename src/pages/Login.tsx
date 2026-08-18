import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { LoginHeroArt } from "../components/LoginHeroArt";
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
  const [remember, setRemember] = useState(true);

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
        if (!remember) sessionStorage.setItem("t2s-session-only", "1");
        else sessionStorage.removeItem("t2s-session-only");
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
      <Watermark />
      <aside className="t2s-login-hero">
        <BrandMark variant="horizontal" size="lg" theme="light" showWordmark="always" />
        <div className="t2s-hero-copy">
          <h1>
            <span className="t2s-blue">Smart</span> Tools.
            <br />
            Real <span className="t2s-green">Results.</span>
            <br />
            Better Tomorrow.
          </h1>
          <p>Make smarter decisions with powerful analytics and real-time market insights.</p>
        </div>
        <LoginHeroArt />
      </aside>

      <section className="t2s-login-panel">
        <div className="t2s-login-card">
          <div className="t2s-login-mobile-brand mb-5 flex justify-center lg:hidden">
            <BrandMark variant="horizontal" size="md" theme="light" showWordmark="always" />
          </div>
          <h2 className="t2s-login-title">
            {page === "signup" ? "Create account" : <>Welcome <span>Back!</span></>}
          </h2>
          <p className="t2s-login-sub">
            {page === "signup" ? "Create your Trade 2 Smart account" : "Login to your Trade 2 Smart account"}
          </p>

          <form onSubmit={onSubmit} autoComplete="on">
            {page === "signup" ? <Field icon="user" label="Name" value={name} onChange={setName} placeholder="Your name" autoComplete="name" /> : null}
            <Field
              icon="user"
              label="Gmail or mobile"
              value={identifier}
              onChange={(value) => {
                setIdentifier(value);
                setSentTo("");
                setOtp("");
              }}
              placeholder="Email or mobile"
              autoComplete="username"
            />
            {sentTo ? (
              <Field icon="lock" label="6-digit code" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" autoComplete="one-time-code" />
            ) : null}
            <Field
              icon="lock"
              label={page === "signup" ? "Set password" : "Password"}
              value={password}
              onChange={setPassword}
              placeholder="Password"
              secret
              autoComplete={page === "signup" ? "new-password" : "current-password"}
            />
            {page === "signup" ? (
              <Field icon="lock" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
            ) : null}

            {page === "signin" ? (
              <div className="t2s-row">
                <label className="t2s-check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Remember me
                </label>
                <button type="button" className="t2s-forgot" disabled={loading} onClick={() => void onSendCode()}>
                  Forgot Password?
                </button>
              </div>
            ) : null}

            <Notice error={error} hint={hint} devOtp={devOtp} />
            <button type="submit" disabled={loading} className="t2s-submit">
              {loading ? "Please wait..." : page === "signup" ? (sentTo ? "Create account" : "Send code") : "Login"}
              <ArrowRight size={18} />
            </button>
          </form>

          <button
            type="button"
            className="t2s-switch"
            onClick={() => {
              setPage(page === "signup" ? "signin" : "signup");
              resetNotice();
            }}
          >
            {page === "signup" ? (
              <>
                Have an account? <b>Login</b>
              </>
            ) : (
              <>
                Don't have an account? <b>Sign Up</b>
              </>
            )}
          </button>
          {page === "signin" ? <p className="t2s-demo">Demo: demo@t2s.app / demo123</p> : null}
        </div>
      </section>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
  onChange,
  placeholder,
  secret,
  autoComplete,
}: {
  icon: "user" | "lock";
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="t2s-field">
      <span className="t2s-field-box">
        {icon === "user" ? <User size={18} /> : <Lock size={18} />}
        <input
          className="t2s-input"
          type={secret && !show ? "password" : "text"}
          value={value}
          placeholder={placeholder || label}
          autoComplete={autoComplete}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
        {secret ? (
          <button type="button" className="t2s-eye" onClick={() => setShow((current) => !current)} aria-label={show ? "Hide password" : "Show password"}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : null}
      </span>
    </label>
  );
}

function Notice({ error, hint, devOtp }: { error: string; hint: string; devOtp: string }) {
  return (
    <>
      {hint ? <p className="t2s-hint">{hint}</p> : null}
      {devOtp ? <div className="t2s-alert t2s-alert-ok">Temporary code: {devOtp}</div> : null}
      {error ? <div className="t2s-alert t2s-alert-err">{error}</div> : null}
    </>
  );
}

function Watermark() {
  return (
    <>
      <svg className="t2s-login-watermark" viewBox="0 0 220 140" fill="none" aria-hidden="true">
        <path d="M10 90 L40 70 L70 100 L110 40 L150 60 L210 20" stroke="#2f7bff" strokeWidth="4" />
        <rect x="36" y="48" width="8" height="40" fill="#22c55e" />
        <rect x="66" y="62" width="8" height="38" fill="#2f7bff" />
        <rect x="106" y="28" width="8" height="52" fill="#22c55e" />
        <rect x="146" y="44" width="8" height="40" fill="#2f7bff" />
      </svg>
      <svg className="t2s-login-waves" viewBox="0 0 400 180" fill="none" aria-hidden="true">
        <path d="M0 80 C80 20, 160 140, 240 70 C300 20, 360 90, 400 50" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M0 110 C90 50, 170 160, 260 100 C320 60, 360 120, 400 90" stroke="#dbe4ee" strokeWidth="2" />
        <path d="M0 140 C70 90, 180 170, 280 120 C340 90, 370 140, 400 130" stroke="#e5e7eb" strokeWidth="2" />
      </svg>
    </>
  );
}
