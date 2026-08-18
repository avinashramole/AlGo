import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { login as loginRequest } from "../api/client";

type User = { name: string; email: string; desk: string };

type AuthContextValue = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

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
          localStorage.setItem("t2s-token", result.token);
          localStorage.setItem("t2s-user", JSON.stringify(result.user));
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          localStorage.setItem("t2s-token", "t2s-offline-token");
          localStorage.setItem("t2s-user", JSON.stringify(demoUser));
          setUser(demoUser);
        }
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
