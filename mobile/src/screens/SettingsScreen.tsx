import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../AuthContext";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors } from "../theme";

export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const { user, logout } = useAuth();
  const { data } = useMarket();
  const active = data.brokers?.find((item) => item.active)?.name || "Dhan";
  const connected = data.brokers?.filter((item) => item.connected).length || 1;
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Settings</Text>
      <Card>
        <Row label="Name" value={user?.name || "Avinash"} />
        <Row label="Account" value={user?.email || "demo@t2s.app"} />
        <Row label="Desk" value={user?.desk || "Index Options"} />
        <Row label="Active broker" value={active} />
        <Row label="Connected" value={String(connected)} />
        <Row label="Product" value="MIS" />
      </Card>
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
  value: { color: colors.muted, fontWeight: "600" },
  link: { height: 44, borderRadius: 12, backgroundColor: "#eef2ff", alignItems: "center", justifyContent: "center", marginBottom: 10 },
  linkText: { color: colors.brand, fontWeight: "700" },
  out: { height: 44, borderRadius: 12, backgroundColor: "#fef3f2", alignItems: "center", justifyContent: "center" },
  outText: { color: colors.down, fontWeight: "700" },
});
