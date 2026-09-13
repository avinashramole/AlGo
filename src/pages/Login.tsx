import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Award,
  BarChart3,
  Eye,
  EyeOff,
  Headphones,
  Lock,
  Mail,
  Phone,
  Shield,
  ShieldCheck,
  User,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LoginHeroArt } from "../components/LoginHeroArt";
import { useAuth } from "../context/AuthContext";
import type { SocialProvider } from "../api/client";
import { PreviewDeskBanner } from "../lib/deskHost";
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
  return "Enter your email or username first.";
}

export function Login() {
  const { login, requestOtp, verifyOtp, signup, resetPassword, startGoogleLogin } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState<"signin" | "signup" | "reset">("signin");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("google_error");
      if (fromUrl) return fromUrl;
      return sessionStorage.getItem("t2s-google-error") || "";
    } catch {
      return "";
    }
  });
  const [loading, setLoading] = useState(false);
  const [remember, setRemember] = useState(() => localStorage.getItem("t2s-remember") !== "0");

  const channel = channelOf(identifier);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("google_error");
      if (fromUrl && fromUrl !== error) setError(fromUrl);
      if (error) sessionStorage.removeItem("t2s-google-error");
    } catch {
      /* ignore */
    }
  }, [error]);

  const resetNotice = () => {
    setError("");
    setHint("");
    setDevOtp("");
    setSentTo("");
    setCode("");
    setPassword("");
    setConfirm("");
    setMobile("");
  };

  const openSignup = () => {
    setPage("signup");
    resetNotice();
    setName("");
    setIdentifier("");
  };

  const applyOtpResult = (result: { to?: string; hint?: string; devOtp?: string }) => {
    setSentTo(result.to || identifier);
    setHint(result.hint || "Enter the 6-digit code we sent.");
    setDevOtp(result.devOtp || "");
  };

  const onSendCode = async (purpose: "signup" | "login" | "reset", provider?: SocialProvider) => {
    if (purpose === "signup") {
      if (name.trim().length < 2) {
        setError("Enter your user name.");
        return false;
      }
      if (!looksLikeMobile(mobile)) {
        setError("Mobile no must be 10 digits.");
        return false;
      }
      if (!identifier.includes("@")) {
        setError("Enter your email id.");
        return false;
      }
    } else if (!identifier.trim()) {
      setError(provider ? socialHint(provider) : purpose === "login" ? "Enter your email. We will send a 6-digit login code there." : "Enter your email or username first.");
      return false;
    }
    if (purpose === "login" && !identifier.includes("@")) {
      setError("Enter the email on your account. We will send a 6-digit login code there.");
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
        mobile: purpose === "signup" ? mobile : undefined,
        channel: purpose === "login" || purpose === "signup" || provider ? "gmail" : channel,
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

  const onGoogle = async () => {
    setLoading(true);
    setError("");
    try {
      await startGoogleLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google login failed");
      setLoading(false);
    }
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
        await resetPassword({ identifier, otp: code, password }, remember);
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset password");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (page === "signup") {
      if (name.trim().length < 2) {
        setError("Enter your user name.");
        return;
      }
      if (!looksLikeMobile(mobile)) {
        setError("Mobile no must be 10 digits.");
        return;
      }
      if (!identifier.includes("@")) {
        setError("Enter your email id.");
        return;
      }
      if (sentTo) {
        if (code.replace(/\D/g, "").length !== 6) {
          setError("Enter the 6-digit email code.");
          return;
        }
        if (password && password !== confirm) {
          setError("Passwords do not match.");
          return;
        }
        setLoading(true);
        try {
          await signup({ name, email: identifier, identifier, mobile, otp: code, password, channel: "gmail" }, remember);
          navigate("/", { replace: true });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Sign up failed");
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!password) {
        setError("Create a password, or tap Email me a signup code.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }
      setLoading(true);
      try {
        await signup({ name, email: identifier, identifier, mobile, password, channel: "gmail" }, remember);
        navigate("/", { replace: true });
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
        await verifyOtp(identifier, code, remember);
        navigate("/", { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not verify code");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setError("Enter your password, or tap Email me a login code.");
      return;
    }

    setLoading(true);
    try {
      await login(identifier || "demo@t2s.app", password, remember);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  const title = page === "signup" ? "Create Account" : page === "reset" ? "Reset password" : "Welcome Back!";
  const sub =
    page === "signup"
      ? ""
      : page === "reset"
        ? "Enter the code we sent, then choose a new password"
        : sentTo
          ? "Enter the 6-digit code we emailed you"
          : "";
  const submitLabel =
    loading
      ? "Please wait..."
      : page === "signup"
        ? "Create Account"
        : page === "reset"
          ? sentTo
            ? "Reset password"
            : "Send reset code"
          : sentTo
            ? "Verify & Login"
            : "Login";

  return (
    <div className="t2s-login">
      <PreviewDeskBanner />
      <div className="t2s-login-main">
        <aside className="t2s-login-hero">
          <LoginHeroArt />
          <div className="t2s-hero-copy">
            <h1>
              Trade <span className="t2s-accent">Smarter.</span>
              <br />
              Grow <span className="t2s-accent">Better.</span>
            </h1>
            <p>Advanced Tools. Real-time Data. Smarter Decisions.</p>
          </div>
          <ul className="t2s-hero-points">
            <HeroPoint icon={<BarChart3 size={18} />} title="Real-time Market" text="Live data & advanced analytics" tone="blue" />
            <HeroPoint icon={<ShieldCheck size={18} />} title="Secure & Safe" text="Bank-grade security & data protection" tone="gold" />
            <HeroPoint icon={<Zap size={18} />} title="Fast Execution" text="Instant order execution with accuracy" tone="blue" />
          </ul>
        </aside>

        <section className="t2s-login-panel">
          <div className="t2s-login-card">
            <div className="t2s-login-avatar">
              <img src="/t2s-logo.png" alt="Trade 2 Smart" />
            </div>
            <h2 className="t2s-login-title">{title}</h2>
            {sub ? <p className="t2s-login-sub">{sub}</p> : <div className="t2s-login-sub t2s-login-sub-empty" />}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmit(event);
              }}
              autoComplete={page === "signup" ? "off" : "on"}
            >
              {page === "signup" ? (
                <>
                  <Field icon="user" label="User Name" value={name} onChange={setName} placeholder="User Name" autoComplete="off" name="t2s-signup-name" />
                  <Field
                    icon="phone"
                    label="Mobile no *"
                    value={mobile}
                    onChange={(value) => setMobile(value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="10-digit mobile no"
                    autoComplete="off"
                    name="t2s-signup-mobile"
                    maxLength={10}
                  />
                  <Field
                    icon="mail"
                    label="Email id"
                    value={identifier}
                    onChange={(value) => {
                      setIdentifier(value);
                      setSentTo("");
                      setCode("");
                    }}
                    placeholder="Email id"
                    autoComplete="off"
                    name="t2s-signup-email"
                    blockAutoFill
                  />
                  {sentTo ? (
                    <Field
                      icon="lock"
                      label="6-digit email code"
                      value={code}
                      onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      autoComplete="one-time-code"
                    />
                  ) : null}
                  <Field icon="lock" label="Create password" value={password} onChange={setPassword} placeholder="Create password" secret autoComplete="new-password" />
                  <Field icon="lock" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
                </>
              ) : (
                <>
                  <Field
                    icon={page === "signin" ? "mail" : "user"}
                    label={page === "signin" ? "Email" : "Email or Username"}
                    value={identifier}
                    onChange={(value) => {
                      setIdentifier(value);
                      setSentTo("");
                      setCode("");
                    }}
                    placeholder="Enter your email"
                    autoComplete="username"
                  />
                  {sentTo ? (
                    <Field
                      icon="lock"
                      label="6-digit code"
                      value={code}
                      onChange={(value) => setCode(value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      autoComplete="one-time-code"
                    />
                  ) : null}
                  {page === "signin" && !sentTo ? (
                    <Field
                      icon="lock"
                      label="Password"
                      value={password}
                      onChange={setPassword}
                      placeholder="Enter your password"
                      secret
                      autoComplete="current-password"
                    />
                  ) : null}
                  {page === "reset" && sentTo ? (
                    <>
                      <Field icon="lock" label="New password" value={password} onChange={setPassword} placeholder="New password" secret autoComplete="new-password" />
                      <Field icon="lock" label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter password" secret autoComplete="new-password" />
                    </>
                  ) : null}
                </>
              )}

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
              </button>
            </form>

            {page === "signin" && !sentTo ? (
              <>
                <div className="t2s-or" role="separator">
                  <span>or</span>
                </div>
                <div className="t2s-alt">
                  <button type="button" className="t2s-alt-btn" disabled={loading} onClick={() => void onSendCode("login")}>
                    <Mail size={18} />
                    Email me a login code
                  </button>
                  <button type="button" className="t2s-alt-btn" disabled={loading} onClick={() => void onGoogle()}>
                    <GoogleIcon />
                    Continue with Google
                  </button>
                </div>
              </>
            ) : null}

            {page === "signup" ? (
              <>
                <div className="t2s-or" role="separator">
                  <span>or</span>
                </div>
                <div className="t2s-alt">
                  <button type="button" className="t2s-alt-btn" disabled={loading} onClick={() => void onSendCode("signup")}>
                    <Mail size={18} />
                    {sentTo ? "Resend email signup code" : "Email me a signup code"}
                  </button>
                </div>
              </>
            ) : null}

            <button
              type="button"
              className="t2s-switch"
              onClick={() => {
                if (page === "signin") {
                  openSignup();
                  return;
                }
                setPage("signin");
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
                  Don&apos;t have an account? <b>Create Account</b>
                </>
              )}
            </button>
          </div>
        </section>
      </div>

      <section className="t2s-benefits">
        <Benefit icon={<Shield size={22} />} tone="blue" title="Trusted Platform" text="Built for serious traders and investors" />
        <Benefit icon={<Award size={22} />} tone="gold" title="Reliable & Transparent" text="Transparent pricing and reliable performance" />
        <Benefit icon={<Headphones size={22} />} tone="blue" title="24/7 Support" text="We're here to help you anytime" />
        <Benefit icon={<Users size={22} />} tone="gold" title="For Everyone" text="From beginners to professionals" />
      </section>

      <footer className="t2s-legal">
        <p>
          © 2026 <b>Trade<span className="t2s-accent">2</span>Smart</b>. All rights reserved.
        </p>
        <div className="t2s-legal-links">
          <span>Privacy Policy</span>
          <span>Terms of Service</span>
          <span>Contact Us</span>
          <span>Help</span>
        </div>
      </footer>
    </div>
  );
}

function HeroPoint({
  icon,
  title,
  text,
  tone,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone: "blue" | "gold";
}) {
  return (
    <li>
      <span className={`t2s-point-icon t2s-point-${tone}`}>{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </li>
  );
}

function Benefit({
  icon,
  title,
  text,
  tone,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone: "blue" | "gold";
}) {
  return (
    <div className="t2s-benefit">
      <span className={`t2s-point-icon t2s-point-${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
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
  name,
  blockAutoFill,
  required,
  maxLength,
}: {
  icon: "user" | "lock" | "mail" | "phone";
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
  autoComplete?: string;
  name?: string;
  blockAutoFill?: boolean;
  required?: boolean;
  maxLength?: number;
}) {
  const [show, setShow] = useState(false);
  const [locked, setLocked] = useState(Boolean(blockAutoFill));
  const Icon = icon === "mail" ? Mail : icon === "phone" ? Phone : icon === "user" ? User : Lock;
  return (
    <label className="t2s-field">
      <span className="t2s-field-box">
        <Icon size={18} />
        <input
          className="t2s-input"
          type={secret && !show ? "password" : icon === "phone" ? "tel" : "text"}
          name={name}
          value={value}
          placeholder={placeholder || label}
          autoComplete={blockAutoFill ? "off" : autoComplete}
          autoCorrect="off"
          spellCheck={false}
          readOnly={locked}
          required={required}
          maxLength={maxLength}
          inputMode={icon === "phone" ? "numeric" : undefined}
          data-1p-ignore={blockAutoFill || undefined}
          data-lpignore={blockAutoFill ? "true" : undefined}
          aria-label={label}
          onFocus={() => setLocked(false)}
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
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5c-.3 1.5-1.2 2.8-2.5 3.6v3h4c2.4-2.2 3.5-5.4 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-4-3.1c-1.1.7-2.5 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.3v3.1C3.3 21.3 7.4 24 12 24z" />
      <path fill="#FBBC05" d="M5.4 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3V6.6H1.3C.5 8.3 0 10.1 0 12s.5 3.7 1.3 5.4l4.1-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4C18 1.2 15.2 0 12 0 7.4 0 3.3 2.7 1.3 6.6l4.1 3.1C6.3 6.9 8.9 4.8 12 4.8z" />
    </svg>
  );
}
