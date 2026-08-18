import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { login as loginRequest, requestOtp as requestOtpApi, verifyOtp as verifyOtpApi, type OtpRequestResult } from "./api";

type User = { name: string; email: string; desk: string };

type AuthContextValue = {
  ready: boolean;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  requestOtp: (email: string, name?: string) => Promise<OtpRequestResult>;
  verifyOtp: (email: string, otp: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("t2s-user")
      .then((raw) => {
        if (raw) setUser(JSON.parse(raw) as User);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      login: async (email: string, password: string) => {
        const isDemo =
          (email.trim().toLowerCase() === "demo@t2s.app" || email.trim().toLowerCase() === "demo") &&
          password === "demo123";
        const demoUser = { name: "Avinash", email: "demo@t2s.app", desk: "Index Options" };
        try {
          const result = await loginRequest(email, password);
          await AsyncStorage.setItem("t2s-user", JSON.stringify(result.user));
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          await AsyncStorage.setItem("t2s-user", JSON.stringify(demoUser));
          setUser(demoUser);
        }
      },
      requestOtp: (email: string, name?: string) => requestOtpApi(email, name),
      verifyOtp: async (email: string, otp: string) => {
        const result = await verifyOtpApi(email, otp);
        await AsyncStorage.setItem("t2s-user", JSON.stringify(result.user));
        setUser(result.user);
      },
      logout: async () => {
        await AsyncStorage.removeItem("t2s-user");
        setUser(null);
      },
    }),
    [ready, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth");
  return context;
}
