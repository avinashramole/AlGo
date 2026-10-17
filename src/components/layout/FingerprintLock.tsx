import { App } from "@capacitor/app";
import { Fingerprint } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark } from "../BrandMark";
import { useAuth } from "../../context/AuthContext";
import { isCapacitorNative } from "../../lib/hybrid";
import { setFingerprintLockOn, shouldLockNativeDesk, verifyFingerprint } from "../../lib/fingerprintLock";

export function FingerprintLock({ children }: { children: ReactNode }) {
  const { user, requestLogout } = useAuth();
  const native = isCapacitorNative();
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const backgroundedAt = useRef(0);

  const lockDesk = async () => {
    if (!user || !native) {
      setLocked(false);
      return;
    }
    const need = await shouldLockNativeDesk();
    setLocked(need);
    if (need) setNote("");
  };

  const unlock = async () => {
    setBusy(true);
    setNote("");
    try {
      await verifyFingerprint("Unlock Trade2Smart");
      setFingerprintLockOn(true);
      setLocked(false);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Fingerprint cancelled.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void lockDesk();
  }, [native, user]);

  useEffect(() => {
    if (!locked || busy) return;
    void unlock();
  }, [locked]);

  useEffect(() => {
    if (!native || !user) return;
    let handle: { remove: () => Promise<void> } | undefined;
    void App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        backgroundedAt.current = Date.now();
        return;
      }
      if (Date.now() - backgroundedAt.current < 8_000) return;
      void lockDesk();
    })
      .then((row) => {
        handle = row;
      })
      .catch(() => undefined);
    return () => {
      void handle?.remove();
    };
  }, [native, user]);

  if (!locked) return children;

  return (
    <>
      {children}
      <div className="t2s-fp-lock" data-fingerprint-lock="true">
        <BrandMark variant="emblem" size="lg" />
        <div className="t2s-fp-lock-title">Fingerprint lock</div>
        <p className="t2s-fp-lock-copy">Use fingerprint or face unlock to open Trade2Smart.</p>
        {note ? <p className="t2s-fp-lock-note">{note}</p> : null}
        <button type="button" className="desk-save-btn" disabled={busy} onClick={() => void unlock()} data-fingerprint-unlock="true">
          <Fingerprint size={18} />
          {busy ? "Waiting..." : "Unlock"}
        </button>
        <button type="button" className="t2s-fp-lock-out" onClick={requestLogout}>
          Sign out
        </button>
      </div>
    </>
  );
}
