import { useNavigation } from "@react-navigation/native";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr, formatNumber } from "../theme";

export function PortfolioScreen() {
  const navigation = useNavigation<any>();
  const { data } = useMarket();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Portfolio</Text>
      <Card>
        <Text style={styles.muted}>DAY P&L</Text>
        <Text style={[styles.pnl, { color: data.totalPnl >= 0 ? colors.up : colors.down }]}>{formatInr(data.totalPnl)}</Text>
      </Card>
      {data.positions.map((row) => (
        <Card key={row.id}>
          <View style={styles.row}>
            <Text style={styles.symbol}>{row.symbol}</Text>
            <Pill text={row.type} up={row.type === "BUY"} />
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>
              {row.brokerId || "paper"} · Qty {row.qty} · Avg {formatNumber(row.avg)}
            </Text>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
          </View>
        </Card>
      ))}
      <Pressable onPress={() => navigation.navigate("Brokers")}>
        <Text style={styles.link}>Brokers →</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("Options")}>
        <Text style={styles.link}>Open option chain →</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("Settings")}>
        <Text style={styles.link}>Settings →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 12 },
  pnl: { fontSize: 28, fontWeight: "800", marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  symbol: { fontWeight: "800", fontSize: 15 },
  link: { color: colors.brand, fontWeight: "700", marginBottom: 12 },
});
