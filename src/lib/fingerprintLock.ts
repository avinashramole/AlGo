import { registerPlugin } from "@capacitor/core";
import { isCapacitorNative } from "./hybrid";

type NativeFingerprint = {
  available: () => Promise<{ available: boolean; biometryType?: string }>;
  verify: (options?: { reason?: string }) => Promise<{ ok: boolean }>;
};

const T2SFingerprint = registerPlugin<NativeFingerprint>("T2SFingerprint", {
  web: {
    available: async () => ({ available: false, biometryType: "" }),
    verify: async () => {
      throw new Error("Fingerprint lock is only on the Android and iOS app.");
    },
  },
});

const LOCK_KEY = "t2s-fingerprint-lock";

export function isFingerprintLockOn() {
  try {
    return localStorage.getItem(LOCK_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setFingerprintLockOn(on: boolean) {
  try {
    localStorage.setItem(LOCK_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export async function fingerprintAvailable() {
  if (!isCapacitorNative()) return false;
  try {
    const row = await T2SFingerprint.available();
    return Boolean(row?.available);
  } catch {
    return false;
  }
}

export async function verifyFingerprint(reason = "Unlock Trade2Smart") {
  const row = await T2SFingerprint.verify({ reason });
  if (!row?.ok) throw new Error("Fingerprint cancelled.");
}

export async function shouldLockNativeDesk() {
  if (!isCapacitorNative()) return false;
  if (!isFingerprintLockOn()) return false;
  return fingerprintAvailable();
}
