import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  enableThumb as enableThumbApi,
  getMe,
  login as loginRequest,
  loginThumb as loginThumbApi,
  requestOtp as requestOtpApi,
  resetPassword as resetPasswordApi,
  signup as signupApi,
  updateProfile as updateProfileApi,
  verifyOtp as verifyOtpApi,
  type AuthUser,
  type OtpPurpose,
  type OtpRequestResult,
  type SocialProvider,
} from "../api/client";

type OtpPayload = {
  identifier: string;
  name?: string;
  channel?: "gmail" | "mobile";
  purpose?: OtpPurpose;
  provider?: SocialProvider;
};

type AuthContextValue = {
  user: AuthUser | null;
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>;
  requestOtp: (payload: OtpPayload) => Promise<OtpRequestResult>;
  verifyOtp: (identifier: string, otp: string, remember?: boolean) => Promise<void>;
  signup: (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }, remember?: boolean) => Promise<void>;
  resetPassword: (payload: { identifier: string; otp: string; password: string }, remember?: boolean) => Promise<void>;
  enableThumb: () => Promise<void>;
  loginThumb: () => Promise<void>;
  updateProfile: (payload: { name: string; email?: string; mobile?: string }) => Promise<void>;
  hasThumb: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken() {
  return localStorage.getItem("t2s-token") || sessionStorage.getItem("t2s-token") || "";
}

function readUser(): AuthUser | null {
  const raw = localStorage.getItem("t2s-user") || sessionStorage.getItem("t2s-user");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persist(user: AuthUser, token: string, remember = true) {
  const keep = remember ? localStorage : sessionStorage;
  const drop = remember ? sessionStorage : localStorage;
  keep.setItem("t2s-token", token);
  keep.setItem("t2s-user", JSON.stringify(user));
  drop.removeItem("t2s-token");
  drop.removeItem("t2s-user");
  localStorage.setItem("t2s-remember", remember ? "1" : "0");
}

function persistUser(user: AuthUser) {
  if (sessionStorage.getItem("t2s-token") && !localStorage.getItem("t2s-token")) {
    sessionStorage.setItem("t2s-user", JSON.stringify(user));
    return;
  }
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
  const [user, setUser] = useState<AuthUser | null>(() => readUser());
  const [hasThumb, setHasThumb] = useState(() => Boolean(localStorage.getItem("t2s-thumb-token")));

  useEffect(() => {
    const token = readToken();
    if (!token || token === "t2s-offline-token") return;
    void getMe(token)
      .then((row) => {
        persistUser(row.user);
        setUser(row.user);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      user,
      hasThumb,
      login: async (identifier: string, password: string, remember = true) => {
        const demoUser = { name: "Avinash", email: "demo@t2s.app", mobile: "", desk: "Index Options" };
        const isDemo =
          (identifier.trim().toLowerCase() === "demo@t2s.app" || identifier.trim().toLowerCase() === "demo") &&
          password === "demo123";
        try {
          const result = await loginRequest(identifier, password);
          persist(result.user, result.token, remember);
          setUser(result.user);
        } catch (error) {
          if (!isDemo) throw error;
          persist(demoUser, "t2s-offline-token", remember);
          setUser(demoUser);
        }
      },
      requestOtp: (payload: OtpPayload) => requestOtpApi(payload),
      verifyOtp: async (identifier: string, otp: string, remember = true) => {
        const result = await verifyOtpApi({ identifier, otp, purpose: "login" });
        if (!result.token || !result.user) throw new Error("Could not sign in with OTP");
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      signup: async (payload: { name: string; identifier: string; otp: string; password: string; channel: "gmail" | "mobile" }, remember = true) => {
        const result = await signupApi(payload);
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      resetPassword: async (payload: { identifier: string; otp: string; password: string }, remember = true) => {
        const result = await resetPasswordApi(payload);
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      enableThumb: async () => {
        const token = readToken();
        const result = await enableThumbApi(token);
        localStorage.setItem("t2s-thumb-token", result.thumbToken);
        setHasThumb(true);
        if (result.user) {
          persistUser(result.user);
          setUser(result.user);
          await registerDeviceThumb(result.user);
        }
      },
      loginThumb: async () => {
        await verifyDeviceThumb();
        const thumbToken = localStorage.getItem("t2s-thumb-token") || "";
        const result = await loginThumbApi(thumbToken);
        persist(result.user, result.token, true);
        setUser(result.user);
      },
      updateProfile: async (payload: { name: string; email?: string; mobile?: string }) => {
        const token = readToken();
        const result = await updateProfileApi(token, payload);
        persistUser(result.user);
        setUser(result.user);
      },
      logout: () => {
        localStorage.removeItem("t2s-token");
        localStorage.removeItem("t2s-user");
        sessionStorage.removeItem("t2s-token");
        sessionStorage.removeItem("t2s-user");
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
