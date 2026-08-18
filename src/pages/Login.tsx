import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { cn } from "../lib/format";

export function Login() {
  const { login, requestOtp, verifyOtp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [name, setName] = useState("Segin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onPassword = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email || "demo@t2s.app", password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Start the API with npm start.");
    } finally {
      setLoading(false);
    }
  };

  const onSendCode = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setHint("");
    setDevOtp("");
    try {
      const result = await requestOtp(email, name);
      setSentTo(result.to || email);
      setHint(result.hint || "Check Gmail for the 6-digit code.");
      setDevOtp(result.devOtp || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send code");
    } finally {
      setLoading(false);
    }
  };

  const onVerify = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await verifyOtp(email, otp);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify code");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white">
            T2
          </div>
          <div>
            <div className="text-xl font-extrabold">T2S Algo Terminal</div>
            <div className="text-sm text-slate-400">Web + iOS + Android desk</div>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("otp");
              setError("");
            }}
            className={cn(
              "h-10 rounded-xl text-sm font-semibold",
              mode === "otp" ? "bg-brand-500 text-white" : "border border-[var(--border)]",
            )}
          >
            Gmail OTP
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("password");
              setEmail("demo@t2s.app");
              setPassword("demo123");
              setError("");
            }}
            className={cn(
              "h-10 rounded-xl text-sm font-semibold",
              mode === "password" ? "bg-brand-500 text-white" : "border border-[var(--border)]",
            )}
          >
            Password
          </button>
        </div>

        {mode === "otp" ? (
          <form onSubmit={sentTo ? onVerify : onSendCode}>
            <label className="mb-3 block text-sm font-semibold">
              Name (new user)
              <input
                className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Segin"
                autoComplete="name"
              />
            </label>
            <label className="mb-3 block text-sm font-semibold">
              Gmail
              <input
                className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setSentTo("");
                  setDevOtp("");
                }}
                placeholder="you@gmail.com"
                autoComplete="email"
                inputMode="email"
              />
            </label>
            {sentTo ? (
              <label className="mb-4 block text-sm font-semibold">
                6-digit code
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal tracking-[0.4em] outline-none focus:border-brand-500"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                />
              </label>
            ) : null}
            {hint ? <p className="mb-3 text-xs font-medium text-slate-500">{hint}</p> : null}
            {devOtp ? (
              <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                Gmail SMTP not set yet. Your code is {devOtp}
              </div>
            ) : null}
            {error ? <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-down dark:bg-rose-950/40">{error}</div> : null}
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? "Please wait..." : sentTo ? "Verify and enter desk" : "Send Gmail code"}
            </button>
            {sentTo ? (
              <button
                type="button"
                disabled={loading}
                onClick={(event) => void onSendCode(event)}
                className="mt-2 h-10 w-full text-sm font-semibold text-brand-500"
              >
                Resend code
              </button>
            ) : null}
            <p className="mt-4 text-center text-xs text-slate-400">
              New user Segin: enter name, Gmail, then the OTP from inbox. Demo password login is still on the Password tab.
            </p>
          </form>
        ) : (
          <form onSubmit={onPassword}>
            <label className="mb-3 block text-sm font-semibold">
              Email
              <input
                className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="mb-4 block text-sm font-semibold">
              Password
              <input
                type="password"
                className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 font-normal outline-none focus:border-brand-500"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {error ? <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-down dark:bg-rose-950/40">{error}</div> : null}
            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Enter desk"}
            </button>
            <p className="mt-4 text-center text-xs text-slate-400">Avinash demo: demo@t2s.app / demo123</p>
          </form>
        )}
      </div>
    </div>
  );
}
