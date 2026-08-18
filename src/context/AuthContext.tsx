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
} from "../api/client";

type AuthContextValue = {
  user: AuthUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  requestOtp: (payload: { identifier: string; name?: string; channel?: "gmail" | "mobile"; purpose?: "signup" | "login" }) => Promise<OtpRequestResult>;
  verifyOtp: (identifier: string, otp: string) => Promise<void>;
  signup: (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }) => Promise<void>;
  enableThumb: () => Promise<void>;
  loginThumb: () => Promise<void>;
  updateProfile: (payload: { name: string; email?: string; mobile?: string }) => Promise<void>;
  hasThumb: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function persist(user: AuthUser, token: string) {
  localStorage.setItem("t2s-token", token);
  localStorage.setItem("t2s-user", JSON.stringify(user));
}

function toBase64Url(bytes: ArrayBuffer) {
  const raw = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const pad = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function registerDeviceThumb(user: AuthUser) {
  if (!window.PublicKeyCredential) return;
  const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
  if (!ok) return;
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "T2S Algo", id: window.location.hostname },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: user.email || user.mobile || user.name,
          displayName: user.name,
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (cred?.rawId) localStorage.setItem("t2s-webauthn-id", toBase64Url(cred.rawId));
  } catch {
    /* Fingerprint prompt is optional; this device still keeps the thumb token. */
  }
}

async function verifyDeviceThumb() {
  const id = localStorage.getItem("t2s-webauthn-id");
  if (!id || !window.PublicKeyCredential) return;
  try {
    await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        timeout: 60_000,
        userVerification: "required",
        rpId: window.location.hostname,
        allowCredentials: [{ type: "public-key", id: fromBase64Url(id) }],
      },
    });
  } catch {
    throw new Error("Thumb cancelled. Use password or OTP.");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("t2s-user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  });
  const [hasThumb, setHasThumb] = useState(() => Boolean(localStorage.getItem("t2s-thumb-token")));

  useEffect(() => {
    const token = localStorage.getItem("t2s-token") || "";
    if (!token || token === "t2s-offline-token") return;
    void getMe(token)
      .then((row) => {
        localStorage.setItem("t2s-user", JSON.stringify(row.user));
        setUser(row.user);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      user,
      hasThumb,
      login: async (identifier: string, password: string) => {
        const demoUser = { name: "Avinash", email: "demo@t2s.app", mobile: "", desk: "Index Options" };
        const isDemo =
          (identifier.trim().toLowerCase() === "demo@t2s.app" || identifier.trim().toLowerCase() === "demo") &&
          password === "demo123";
        try {
          const result = await loginRequest(identifier, password);
          persist(result.user, result.token);
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          persist(demoUser, "t2s-offline-token");
          setUser(demoUser);
        }
      },
      requestOtp: (payload: { identifier: string; name?: string; channel?: "gmail" | "mobile"; purpose?: "signup" | "login" }) =>
        requestOtpApi(payload),
      verifyOtp: async (identifier: string, otp: string) => {
        const result = await verifyOtpApi({ identifier, otp, purpose: "login" });
        if (!result.token || !result.user) throw new Error("Could not sign in with OTP");
        persist(result.user, result.token);
        setUser(result.user);
      },
      signup: async (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }) => {
        const result = await signupApi(payload);
        persist(result.user, result.token);
        setUser(result.user);
      },
      enableThumb: async () => {
        const token = localStorage.getItem("t2s-token") || "";
        const result = await enableThumbApi(token);
        localStorage.setItem("t2s-thumb-token", result.thumbToken);
        setHasThumb(true);
        if (result.user) {
          localStorage.setItem("t2s-user", JSON.stringify(result.user));
          setUser(result.user);
          await registerDeviceThumb(result.user);
        }
      },
      loginThumb: async () => {
        await verifyDeviceThumb();
        const thumbToken = localStorage.getItem("t2s-thumb-token") || "";
        const result = await loginThumbApi(thumbToken);
        persist(result.user, result.token);
        setUser(result.user);
      },
      updateProfile: async (payload: { name: string; email?: string; mobile?: string }) => {
        const token = localStorage.getItem("t2s-token") || "";
        const result = await updateProfileApi(token, payload);
        localStorage.setItem("t2s-user", JSON.stringify(result.user));
        setUser(result.user);
      },
      logout: () => {
        localStorage.removeItem("t2s-token");
        localStorage.removeItem("t2s-user");
        setUser(null);
      },
    }),
    [user, hasThumb],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
