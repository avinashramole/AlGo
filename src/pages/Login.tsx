import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("demo@t2s.app");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed. Start the API with npm start.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-extrabold text-white">
            T2
          </div>
          <div>
            <div className="text-xl font-extrabold">T2S Algo Terminal</div>
            <div className="text-sm text-slate-400">Web + iOS + Android desk</div>
          </div>
        </div>
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
        {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-down dark:bg-rose-950/40">{error}</div>}
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl bg-brand-500 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Enter desk"}
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">Demo login: demo@t2s.app / demo123</p>
      </form>
    </div>
  );
}
