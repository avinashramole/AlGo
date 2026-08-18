import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { login as loginRequest, requestOtp as requestOtpApi, verifyOtp as verifyOtpApi, type OtpRequestResult } from "../api/client";

type User = { name: string; email: string; desk: string };

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string, name?: string) => Promise<OtpRequestResult>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function persist(user: User, token: string) {
  localStorage.setItem("t2s-token", token);
  localStorage.setItem("t2s-user", JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const raw = localStorage.getItem("t2s-user");
    return raw ? (JSON.parse(raw) as User) : null;
  });

  const value = useMemo(
    () => ({
      user,
      login: async (email: string, password: string) => {
        const demoUser = { name: "Avinash", email: "demo@t2s.app", desk: "Index Options" };
        const isDemo =
          (email.trim().toLowerCase() === "demo@t2s.app" || email.trim().toLowerCase() === "demo") &&
          password === "demo123";
        try {
          const result = await loginRequest(email, password);
          persist(result.user, result.token);
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          persist(demoUser, "t2s-offline-token");
          setUser(demoUser);
        }
      },
      requestOtp: (email: string, name?: string) => requestOtpApi(email, name),
      verifyOtp: async (email: string, otp: string) => {
        const result = await verifyOtpApi(email, otp);
        persist(result.user, result.token);
        setUser(result.user);
      },
      logout: () => {
        localStorage.removeItem("t2s-token");
        localStorage.removeItem("t2s-user");
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
