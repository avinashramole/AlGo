import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  enableThumb as enableThumbApi,
  getMe,
  googleAuthStatus,
  logoutSession,
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
  mobile?: string;
  channel?: "gmail" | "mobile";
  purpose?: OtpPurpose;
  provider?: SocialProvider;
};

type SignupPayload = {
  name: string;
  email?: string;
  mobile?: string;
  identifier?: string;
  otp?: string;
  password?: string;
  channel?: "gmail" | "mobile";
};

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  login: (identifier: string, password: string, remember?: boolean) => Promise<void>;
  requestOtp: (payload: OtpPayload) => Promise<OtpRequestResult>;
  verifyOtp: (identifier: string, otp: string, remember?: boolean) => Promise<void>;
  signup: (payload: SignupPayload, remember?: boolean) => Promise<void>;
  resetPassword: (payload: { identifier: string; otp: string; password: string }, remember?: boolean) => Promise<void>;
  startGoogleLogin: () => Promise<void>;
  enableThumb: () => Promise<void>;
  loginThumb: () => Promise<void>;
  updateProfile: (payload: { name: string; email?: string; mobile?: string }) => Promise<void>;
  applyUser: (next: AuthUser) => void;
  refreshMe: () => Promise<void>;
  hasThumb: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

let memoryToken = "";

function readToken() {
  return memoryToken || localStorage.getItem("t2s-token") || sessionStorage.getItem("t2s-token") || "";
}

function clearStoredSession() {
  memoryToken = "";
  localStorage.removeItem("t2s-token");
  localStorage.removeItem("t2s-user");
  sessionStorage.removeItem("t2s-token");
  sessionStorage.removeItem("t2s-user");
}

function signedOut(error: unknown) {
  return /sign in first/i.test(error instanceof Error ? error.message : String(error || ""));
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
  memoryToken = token;
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

function preferAccount(current: AuthUser | null, next: AuthUser): AuthUser {
  const nextName = String(next.name || "").trim();
  const currentName = String(current?.name || "").trim();
  const name =
    nextName && nextName !== "Google user"
      ? nextName
      : currentName && currentName !== "Google user"
        ? currentName
        : nextName || currentName;
  return {
    ...current,
    ...next,
    name,
    email: next.email || current?.email || "",
    mobile: next.mobile || current?.mobile || "",
    authProvider: next.authProvider || current?.authProvider || "",
    loginIp: next.loginIp || current?.loginIp || "",
  };
}

function bootFromWindow() {
  if (typeof window === "undefined") return readUser();
  const params = new URLSearchParams(window.location.search);
  const googleToken = params.get("google_token") || "";
  if (!googleToken) return readUser();
  const email = params.get("google_email")?.trim() || "";
  const mobile = params.get("google_mobile")?.trim() || "";
  const given = params.get("google_name")?.trim() || "";
  const pending: AuthUser = {
    name: given || (email.includes("@") ? email.split("@")[0] : "Google user"),
    email,
    mobile,
    desk: "Index Options",
    role: "user",
    authProvider: "google",
  };
  persist(pending, googleToken, true);
  return pending;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => bootFromWindow());
  const [hasThumb, setHasThumb] = useState(() => Boolean(localStorage.getItem("t2s-thumb-token")));
  const [ready, setReady] = useState(() => {
    const token = readToken();
    if (token === "t2s-offline-token") return true;
    return readUser()?.role === "admin";
  });

  const applyUser = useCallback((next: AuthUser) => {
    persistUser(next);
    setUser(next);
  }, []);

  const refreshMe = useCallback(async () => {
    const token = readToken();
    if (token === "t2s-offline-token") return;
    const apply = (next: AuthUser) => {
      const merged = preferAccount(readUser(), next);
      persistUser(merged);
      setUser(merged);
    };
    try {
      const row = await getMe(token);
      apply(row.user);
      return;
    } catch (error) {
      if (!signedOut(error)) throw error;
    }
    try {
      const row = await getMe("");
      apply(row.user);
    } catch (error) {
      if (!signedOut(error)) throw error;
      const current = readUser();
      if (current?.email) {
        setUser(current);
        return;
      }
      clearStoredSession();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleError = params.get("google_error");
    if (googleError) {
      try {
        sessionStorage.setItem("t2s-google-error", googleError);
      } catch {
        /* ignore */
      }
    }
    const token = readToken();
    if (token === "t2s-offline-token") {
      setReady(true);
      return;
    }
    void refreshMe()
      .catch((error) => {
        if (signedOut(error) && !readUser()?.email) {
          clearStoredSession();
          setUser(null);
        }
      })
      .finally(() => setReady(true));
  }, [refreshMe]);

  const value = useMemo(
    () => ({
      user,
      ready,
      hasThumb,
      login: async (identifier: string, password: string, remember = true) => {
        const result = await loginRequest(identifier, password);
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      requestOtp: (payload: OtpPayload) => requestOtpApi(payload),
      verifyOtp: async (identifier: string, otp: string, remember = true) => {
        const result = await verifyOtpApi({ identifier, otp, purpose: "login" });
        if (!result.token || !result.user) throw new Error("Could not sign in with OTP");
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      signup: async (payload: SignupPayload, remember = true) => {
        const result = await signupApi(payload);
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      resetPassword: async (payload: { identifier: string; otp: string; password: string }, remember = true) => {
        const result = await resetPasswordApi(payload);
        persist(result.user, result.token, remember);
        setUser(result.user);
      },
      startGoogleLogin: async () => {
        const status = await googleAuthStatus();
        if (!status.configured) {
          throw new Error(
            "Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the VPS, then restart t2s.",
          );
        }
        window.location.href = `/api/auth/google?next=${encodeURIComponent(window.location.origin)}`;
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
        try {
          const result = await updateProfileApi(token, payload);
          persistUser(result.user);
          setUser(result.user);
        } catch (error) {
          if (!signedOut(error) || !token) throw error;
          clearStoredSession();
          const result = await updateProfileApi("", payload);
          persistUser(result.user);
          setUser(result.user);
        }
      },
      applyUser,
      refreshMe,
      logout: () => {
        void logoutSession();
        clearStoredSession();
        setUser(null);
      },
    }),
    [user, ready, hasThumb, applyUser, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
