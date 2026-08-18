import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr } from "../theme";

export function AlgoScreen() {
  const { data, toggle } = useMarket();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Algo Desk</Text>
      {data.algos.map((algo) => (
        <Card key={algo.id}>
          <View style={styles.row}>
            <View>
              <Text style={styles.name}>{algo.name}</Text>
              <Text style={styles.muted}>{algo.tag}</Text>
            </View>
            <Pill text={algo.status} up={algo.status === "LIVE"} />
          </View>
          <View style={styles.stats}>
            <Text style={{ color: algo.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(algo.pnl)}</Text>
            <Text style={styles.muted}>WR {algo.winRate}%</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>{algo.enabled ? "Running" : "Paused"}</Text>
            <Switch value={algo.enabled} onValueChange={() => void toggle(algo.id)} />
          </View>
        </Card>
      ))}
      <Pressable style={styles.cta}>
        <Text style={styles.ctaText}>New Strategy</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "800" },
  muted: { color: colors.muted, marginTop: 4 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginVertical: 12 },
  cta: { height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700" },
});
