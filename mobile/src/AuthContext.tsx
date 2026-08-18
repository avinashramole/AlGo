import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  enableThumb as enableThumbApi,
  getMe,
  login as loginRequest,
  loginThumb as loginThumbApi,
  requestOtp as requestOtpApi,
  signup as signupApi,
  updateProfile as updateProfileApi,
  verifyOtp as verifyOtpApi,
  type AuthUser,
  type OtpRequestResult,
} from "./api";

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  hasThumb: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  requestOtp: (payload: { identifier: string; name?: string; channel?: "gmail" | "mobile"; purpose?: "signup" | "login" }) => Promise<OtpRequestResult>;
  verifyOtp: (identifier: string, otp: string) => Promise<void>;
  signup: (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }) => Promise<void>;
  enableThumb: () => Promise<void>;
  loginThumb: () => Promise<void>;
  updateProfile: (payload: { name: string; email?: string; mobile?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persist(user: AuthUser, token: string) {
  await AsyncStorage.multiSet([
    ["t2s-user", JSON.stringify(user)],
    ["t2s-token", token],
  ]);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [hasThumb, setHasThumb] = useState(false);

  useEffect(() => {
    Promise.all([AsyncStorage.getItem("t2s-user"), AsyncStorage.getItem("t2s-thumb-token"), AsyncStorage.getItem("t2s-token")])
      .then(async ([raw, thumb, token]) => {
        if (raw) setUser(JSON.parse(raw) as AuthUser);
        setHasThumb(Boolean(thumb));
        if (token && token !== "t2s-offline-token") {
          try {
            const row = await getMe(token);
            await AsyncStorage.setItem("t2s-user", JSON.stringify(row.user));
            setUser(row.user);
          } catch {
            /* keep cached user */
          }
        }
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(
    () => ({
      ready,
      user,
      hasThumb,
      login: async (identifier: string, password: string) => {
        const isDemo =
          (identifier.trim().toLowerCase() === "demo@t2s.app" || identifier.trim().toLowerCase() === "demo") &&
          password === "demo123";
        const demoUser = { name: "Avinash", email: "demo@t2s.app", mobile: "", desk: "Index Options" };
        try {
          const result = await loginRequest(identifier, password);
          await persist(result.user, result.token);
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          await persist(demoUser, "t2s-offline-token");
          setUser(demoUser);
        }
      },
      requestOtp: (payload: { identifier: string; name?: string; channel?: "gmail" | "mobile"; purpose?: "signup" | "login" }) =>
        requestOtpApi(payload),
      verifyOtp: async (identifier: string, otp: string) => {
        const result = await verifyOtpApi({ identifier, otp, purpose: "login" });
        if (!result.token || !result.user) throw new Error("Could not sign in with OTP");
        await persist(result.user, result.token);
        setUser(result.user);
      },
      signup: async (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }) => {
        const result = await signupApi(payload);
        await persist(result.user, result.token);
        setUser(result.user);
      },
      enableThumb: async () => {
        const hardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) throw new Error("Turn on fingerprint or Face ID on this phone first.");
        const bio = await LocalAuthentication.authenticateAsync({ promptMessage: "Enable thumb for T2S" });
        if (!bio.success) throw new Error("Thumb cancelled.");
        const token = (await AsyncStorage.getItem("t2s-token")) || "";
        const result = await enableThumbApi(token);
        await AsyncStorage.setItem("t2s-thumb-token", result.thumbToken);
        setHasThumb(true);
        if (result.user) {
          await AsyncStorage.setItem("t2s-user", JSON.stringify(result.user));
          setUser(result.user);
        }
      },
      loginThumb: async () => {
        const thumbToken = (await AsyncStorage.getItem("t2s-thumb-token")) || "";
        if (!thumbToken) throw new Error("Sign in with password or OTP first, then enable Thumb in Settings.");
        const hardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync());
        if (!enrolled) throw new Error("Turn on fingerprint or Face ID on this phone.");
        const bio = await LocalAuthentication.authenticateAsync({ promptMessage: "Sign in to T2S" });
        if (!bio.success) throw new Error("Thumb cancelled. Use password or OTP.");
        const result = await loginThumbApi(thumbToken);
        await persist(result.user, result.token);
        setUser(result.user);
      },
      updateProfile: async (payload: { name: string; email?: string; mobile?: string }) => {
        const token = (await AsyncStorage.getItem("t2s-token")) || "";
        const result = await updateProfileApi(token, payload);
        await AsyncStorage.setItem("t2s-user", JSON.stringify(result.user));
        setUser(result.user);
      },
      logout: async () => {
        await AsyncStorage.multiRemove(["t2s-user", "t2s-token"]);
        setUser(null);
      },
    }),
    [ready, user, hasThumb],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth");
  return context;
}
