import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { LoginHeroArt } from "../components/LoginHeroArt";
import { useAuth } from "../context/AuthContext";
import type { SocialProvider } from "../api/client";
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

function socialHint(provider: SocialProvider) {
  if (provider === "microsoft") return "Enter your Microsoft email (Outlook / Hotmail / Live) first.";
  if (provider === "apple") return "Enter your Apple ID email (iCloud / me.com) first.";
  return "Enter your Gmail (you@gmail.com) first.";
}

export function Login() {
  const { login, requestOtp, verifyOtp, signup, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<"signin" | "signup" | "reset">("signin");
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
  const [remember, setRemember] = useState(() => localStorage.getItem("t2s-remember") !== "0");

  const channel = channelOf(identifier);

  const resetNotice = () => {
    setError("");
    setHint("");
    setDevOtp("");
    setSentTo("");
    setOtp("");
    setPassword("");
    setConfirm("");
  };

  const applyOtpResult = (result: { to?: string; hint?: string; devOtp?: string }) => {
    setSentTo(result.to || identifier);
    setHint(result.hint || "Enter the 6-digit code.");
    setDevOtp(result.devOtp || "");
  };

  const onSendCode = async (purpose: "signup" | "login" | "reset", provider?: SocialProvider) => {
    if (!identifier.trim()) {
      setError(provider ? socialHint(provider) : "Enter your Gmail or mobile first.");
      return false;
    }
    if (purpose === "signup" && name.trim().length < 2) {
      setError("Enter your name, then send the code.");
      return false;
    }
    setLoading(true);
    setError("");
    setHint("");
    setDevOtp("");
    try {
      const result = await requestOtp({
        identifier,
        name,
        channel: provider ? "gmail" : channel,
        purpose,
        provider,
      });
      applyOtpResult(result);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const onSocial = async (provider: SocialProvider) => {
    const purpose = page === "signup" ? "signup" : "login";
    const ok = await onSendCode(purpose, provider);
    if (ok && page === "reset") setPage("signin");
  };

  const onForgot = async () => {
    const ok = await onSendCode("reset");
    if (ok) {
      setPage("reset");
      setPassword("");
      setConfirm("");
    }
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (page === "reset") {
      if (!sentTo) {
        await onForgot();
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setLoading(true);
      try {
        await resetPassword({ identifier, otp, password }, remember);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset password");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (page === "signup") {
      if (!sentTo) {
        await onSendCode("signup");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setLoading(true);
      try {
        await signup({ name, identifier, otp, password, channel }, remember);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Sign up failed");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (sentTo) {
      setLoading(true);
      try {
        await verifyOtp(identifier, otp, remember);
        navigate("/");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify code");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError("Enter your password, or continue with Google / Microsoft / Apple.");
      return;
    }

    setLoading(true);
    try {
      await login(identifier || "demo@t2s.app", password, remember);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const title = page === "signup" ? "Create account" : page === "reset" ? "Reset password" : "Welcome Back!";
  const sub =
    page === "signup"
      ? "Create your Trade 2 Smart account"
      : page === "reset"
        ? "Enter the code we sent, then choose a new password"
        : "Login to your Trade 2 Smart account";
  const submitLabel =
    loading
      ? "Please wait..."
      : page === "signup"
        ? sentTo
          ? "Create account"
          : "Send code"
        : page === "reset"
          ? sentTo
            ? "Reset password"
            : "Send reset code"
          : sentTo
            ? "Verify & Login"
            : "Login";

  return (
    <div className="t2s-login">
      <Watermark />
      <aside className="t2s-login-hero">
        <BrandMark variant="horizontal" size="lg" theme="light" showWordmark="always" wordmark="ink" />
        <div className="t2s-hero-copy">
          <h1>
            <span className="t2s-blue">Smart</span> Tools.
            <br />
            Real <span className="t2s-green">Results.</span>
            <br />
            Better <span className="t2s-navy">Tomorrow.</span>
          </h1>
          <p>Make smarter decisions with powerful analytics and real-time market insights.</p>
        </div>
        <LoginHeroArt />
      </aside>

      <section className="t2s-login-panel">
        <div className="t2s-login-card">
          <div className="t2s-login-mobile-brand mb-5 flex justify-center lg:hidden">
            <BrandMark variant="horizontal" size="md" theme="light" showWordmark="always" wordmark="ink" />
          </div>
          <h2 className="t2s-login-title">{title}</h2>
          <p className="t2s-login-sub">{sub}</p>

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
              placeholder="Email or Username"
              autoComplete="username"
            />
            {sentTo ? (
              <Field
                icon="lock"
                label="6-digit code"
                value={otp}
                onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                autoComplete="one-time-code"
              />
            ) : null}
            {page === "signin" && !sentTo ? (
              <Field icon="lock" label="Password" value={password} onChange={setPassword} placeholder="Password" secret autoComplete="current-password" />
            ) : null}
            {page === "signup" && sentTo ? (
              <>
                <Field icon="lock" label="Set password" value={password} onChange={setPassword} placeholder="Password" secret autoComplete="new-password" />
                <Field icon="lock" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
              </>
            ) : null}
            {page === "reset" && sentTo ? (
              <>
                <Field icon="lock" label="New password" value={password} onChange={setPassword} placeholder="New password" secret autoComplete="new-password" />
                <Field icon="lock" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
              </>
            ) : null}

            {page === "signin" && !sentTo ? (
              <div className="t2s-row">
                <label className="t2s-check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Remember me
                </label>
                <button type="button" className="t2s-forgot" disabled={loading} onClick={() => void onForgot()}>
                  Forgot Password?
                </button>
              </div>
            ) : page === "signin" || page === "reset" ? (
              <div className="t2s-row">
                <label className="t2s-check">
                  <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                  Remember me
                </label>
                {sentTo ? (
                  <button
                    type="button"
                    className="t2s-forgot"
                    disabled={loading}
                    onClick={() => void onSendCode(page === "reset" ? "reset" : "login")}
                  >
                    Resend code
                  </button>
                ) : null}
              </div>
            ) : null}

            <Notice error={error} hint={hint} devOtp={devOtp} />
            <button type="submit" disabled={loading} className="t2s-submit">
              {submitLabel}
              <ArrowRight size={18} />
            </button>
          </form>

          {page !== "reset" ? (
            <>
              <div className="t2s-or" role="separator">
                <span>or continue with</span>
              </div>
              <div className="t2s-social">
                <button type="button" className="t2s-social-btn" disabled={loading} onClick={() => void onSocial("google")} aria-label="Continue with Google">
                  <GoogleIcon />
                </button>
                <button type="button" className="t2s-social-btn" disabled={loading} onClick={() => void onSocial("microsoft")} aria-label="Continue with Microsoft">
                  <MicrosoftIcon />
                </button>
                <button type="button" className="t2s-social-btn" disabled={loading} onClick={() => void onSocial("apple")} aria-label="Continue with Apple">
                  <AppleIcon />
                </button>
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="t2s-switch"
            onClick={() => {
              setPage(page === "signin" ? "signup" : "signin");
              resetNotice();
            }}
          >
            {page === "signup" ? (
              <>
                Have an account? <b>Login</b>
              </>
            ) : page === "reset" ? (
              <>
                Remembered it? <b>Login</b>
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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.5 3.6v3h4c2.4-2.2 3.5-5.4 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-4-3.1c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.3v3.1C3.3 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.4l4.1-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.3 6.6l4.1 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path fill="#F25022" d="M3 3h8.5v8.5H3z" />
      <path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z" />
      <path fill="#00A4EF" d="M3 12.5h8.5V21H3z" />
      <path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        fill="#111827"
        d="M16.4 12.6c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.9-3.5.9s-1.8-1-3-.9c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7 2-1.1 2.8-2.2c.9-1.3 1.3-2.6 1.3-2.6s-2.5-1-2.5-3.8zm-2.3-6.7c.6-.8 1.1-1.9.9-3-1 .1-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.3-.6 3-1.5z"
      />
    </svg>
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
      <svg className="t2s-login-waves t2s-login-waves-top" viewBox="0 0 400 180" fill="none" aria-hidden="true">
        <path d="M0 80 C80 20, 160 140, 240 70 C300 20, 360 90, 400 50" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M0 110 C90 50, 170 160, 260 100 C320 60, 360 120, 400 90" stroke="#dbe4ee" strokeWidth="2" />
      </svg>
      <svg className="t2s-login-waves" viewBox="0 0 400 180" fill="none" aria-hidden="true">
        <path d="M0 80 C80 20, 160 140, 240 70 C300 20, 360 90, 400 50" stroke="#cbd5e1" strokeWidth="2" />
        <path d="M0 110 C90 50, 170 160, 260 100 C320 60, 360 120, 400 90" stroke="#dbe4ee" strokeWidth="2" />
        <path d="M0 140 C70 90, 180 170, 280 120 C340 90, 370 140, 400 130" stroke="#e5e7eb" strokeWidth="2" />
      </svg>
    </>
  );
}
