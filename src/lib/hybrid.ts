import { Capacitor } from "@capacitor/core";

export const LIVE_DESK_ORIGIN = "https://trade2smart.com";

export function isNativeHybrid() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function apiBase() {
  return isNativeHybrid() ? `${LIVE_DESK_ORIGIN}/api` : "/api";
}

export function googleLoginNext() {
  if (typeof window === "undefined") return LIVE_DESK_ORIGIN;
  return isNativeHybrid() ? LIVE_DESK_ORIGIN : window.location.origin;
}
