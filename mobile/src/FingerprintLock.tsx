import { useEffect, useRef, useState, type ReactNode } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { BrandMark } from "./components/BrandMark";
import { colors } from "./theme";

export function FingerprintLock({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const backgroundedAt = useRef(0);

  const lockIfReady = async () => {
    try {
      const hardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hardware && (await LocalAuthentication.isEnrolledAsync());
      setLocked(Boolean(enrolled));
    } catch {
      setLocked(false);
    }
  };

  const unlock = async () => {
    setBusy(true);
    setNote("");
    try {
      const bio = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Trade2Smart" });
      if (!bio.success) throw new Error("Fingerprint cancelled.");
      setLocked(false);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Fingerprint cancelled.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void lockIfReady();
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (Date.now() - backgroundedAt.current < 8000) return;
      void lockIfReady();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (locked && !busy) void unlock();
  }, [locked]);

  if (!locked) return children;

  return (
    <View style={styles.page}>
      <BrandMark variant="emblem" />
      <Text style={styles.title}>Fingerprint lock</Text>
      <Text style={styles.copy}>Use fingerprint or Face ID to open Trade2Smart.</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <Pressable style={styles.unlock} onPress={() => void unlock()} disabled={busy}>
        <Text style={styles.unlockText}>{busy ? "Waiting..." : "Unlock"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, padding: 24, gap: 10 },
  title: { fontSize: 20, fontWeight: "800" },
  copy: { textAlign: "center", color: colors.muted, maxWidth: 280 },
  note: { color: colors.down, fontWeight: "700", textAlign: "center" },
  unlock: { height: 44, minWidth: 160, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  unlockText: { color: "#fff", fontWeight: "700" },
});
