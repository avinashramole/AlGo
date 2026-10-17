import { Fingerprint } from "lucide-react";
import { useEffect, useState } from "react";
import { isCapacitorNative } from "../../lib/hybrid";
import {
  fingerprintAvailable,
  isFingerprintLockOn,
  setFingerprintLockOn,
  verifyFingerprint,
} from "../../lib/fingerprintLock";
import { PhoneCard, SettingsRow } from "../phone/PhoneUi";

export function FingerprintLockRow() {
  const native = isCapacitorNative();
  const [ready, setReady] = useState(false);
  const [on, setOn] = useState(isFingerprintLockOn());

  useEffect(() => {
    if (!native) return;
    void fingerprintAvailable().then(setReady);
  }, [native]);

  if (!native || !ready) return null;

  return (
    <PhoneCard data-fingerprint-settings="true">
      <SettingsRow
        icon={Fingerprint}
        label="Fingerprint lock"
        detail={on ? "On · unlocks this app" : "Off"}
        onClick={() => {
          void (async () => {
            if (!on) {
              await verifyFingerprint("Enable fingerprint lock");
              setFingerprintLockOn(true);
              setOn(true);
              return;
            }
            setFingerprintLockOn(false);
            setOn(false);
          })();
        }}
      />
    </PhoneCard>
  );
}
