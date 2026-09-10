import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatNumber } from "../theme";

function strategyLabel(row: { strategy?: string }, algos: Array<{ id?: string; name?: string }> = []) {
  const raw = String(row.strategy || "").trim();
  if (!raw || /^(manual|auto)$/i.test(raw)) return "";
  const compact = raw.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9+-]/g, "").toLowerCase();
  const match = algos.find((algo) => {
    const name = String(algo.name || "").trim();
    if (!name) return false;
    return name === raw || name.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9+-]/g, "").toLowerCase() === compact || algo.id === raw;
  });
  return match?.name || raw;
}

export function OrdersScreen() {
  const { data, cancel } = useMarket();
  const orders = data.orders || [];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Order Book</Text>
      <Text style={styles.muted}>
        {data.dhanFeed?.live ? `${orders.length} live Dhan + paper orders today` : `${orders.length} orders today`}
      </Text>
      {orders.map((row) => (
        <Card key={row.id}>
          <View style={styles.row}>
            <Text style={styles.symbol}>{row.symbol}</Text>
            <Pill text={row.status} up={row.status === "FILLED"} />
          </View>
          <Text style={styles.strategy}>
            {strategyLabel(row, data.algos || []) ? `${row.side === "SELL" ? "SELL" : "BUY"} by ${strategyLabel(row, data.algos || [])}` : row.side === "SELL" ? "SELL" : "BUY"}
          </Text>
          <Text style={styles.muted}>
            {row.side} · {row.filledQty || 0}/{row.qty} · {row.type || "MARKET"} · {formatNumber(row.price)}
          </Text>
          <Text style={styles.muted}>{row.brokerName || row.brokerId || "dhan"}</Text>
          {row.reason ? <Text style={{ color: colors.down, marginTop: 6, fontWeight: "700" }}>{row.reason}</Text> : null}
          {row.status === "PENDING" || row.status === "PARTIAL" ? (
            <Pressable
              style={styles.btn}
              onPress={() =>
                Alert.alert("Cancel order", `Cancel ${row.symbol}?`, [
                  { text: "Keep" },
                  { text: "Cancel order", style: "destructive", onPress: () => void cancel(row.id) },
                ])
              }
            >
              <Text style={styles.btnText}>Cancel</Text>
            </Pressable>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 4 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  symbol: { fontWeight: "800", fontSize: 15, flex: 1, paddingRight: 8 },
  strategy: { color: colors.text, fontSize: 13, fontWeight: "800", marginTop: 4 },
  btn: { marginTop: 10, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.down, alignItems: "center", justifyContent: "center" },
  btnText: { color: colors.down, fontWeight: "700" },
});
