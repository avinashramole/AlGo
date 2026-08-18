import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../AuthContext";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors } from "../theme";

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user, logout, enableThumb, hasThumb } = useAuth();
  const { data } = useMarket();
  const [busy, setBusy] = useState(false);
  const active = data.brokers?.find((item) => item.active)?.name || "Dhan";
  const connected = data.brokers?.filter((item) => item.connected).length || 1;

  const onThumb = async () => {
    setBusy(true);
    try {
      await enableThumb();
      Alert.alert("Thumb enabled", "Next time use Sign in → Thumb, then fingerprint or Face ID.");
    } catch (error) {
      Alert.alert("Thumb", error instanceof Error ? error.message : "Could not enable thumb");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <Text style={styles.title}>Settings</Text>
      <Card>
        <Row label="Name" value={user?.name || "Avinash"} />
        <Row label="Gmail" value={user?.email || "—"} />
        <Row label="Mobile" value={user?.mobile || "—"} />
        <Row label="Desk" value={user?.desk || "Index Options"} />
        <Row label="Thumb" value={hasThumb ? "On this phone" : "Off"} />
        <Row label="Active broker" value={active} />
        <Row label="Connected" value={String(connected)} />
        <Row label="Product" value="MIS" />
      </Card>
      <Pressable style={styles.link} onPress={() => void onThumb()} disabled={busy}>
        <Text style={styles.linkText}>{busy ? "Please wait..." : hasThumb ? "Reset thumb on this phone" : "Enable thumb on this phone"}</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => navigation.navigate("Brokers")}>
        <Text style={styles.linkText}>Open broker hub</Text>
      </Pressable>
      <Pressable style={styles.out} onPress={() => void logout()}>
        <Text style={styles.outText}>Log out</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  value: { color: colors.muted, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  link: { height: 44, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  linkText: { color: colors.brand, fontWeight: "700" },
  out: { height: 44, borderRadius: 12, backgroundColor: "#fef3f2", alignItems: "center", justifyContent: "center" },
  outText: { color: colors.down, fontWeight: "700" },
});
