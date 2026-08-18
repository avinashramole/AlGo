import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../AuthContext";
import { Card } from "../components/Ui";
import { colors } from "../theme";

export function SettingsScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.page}>
      <Text style={styles.title}>Settings</Text>
      <Card>
        <Row label="Account" value={user?.email || "demo@t2s.app"} />
        <Row label="Desk" value={user?.desk || "Index Options"} />
        <Row label="Broker" value="Paper trading" />
        <Row label="Product" value="MIS" />
      </Card>
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
  out: { height: 44, borderRadius: 12, backgroundColor: "#fef3f2", alignItems: "center", justifyContent: "center" },
  outText: { color: colors.down, fontWeight: "700" },
});
