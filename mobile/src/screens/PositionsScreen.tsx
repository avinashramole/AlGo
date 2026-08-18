import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr, formatNumber } from "../theme";

export function PositionsScreen() {
  const { data, closePosition } = useMarket();
  const pnl = data.positions.reduce((sum, row) => sum + row.pnl, 0);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Positions</Text>
      <Text style={styles.muted}>
        {data.dhanFeed?.live ? "LIVE · real Dhan positions only" : "Open book"}
      </Text>
      <Card>
        <Text style={styles.muted}>UNREALIZED P&L</Text>
        <Text style={[styles.pnl, { color: pnl >= 0 ? colors.up : colors.down }]}>{formatInr(pnl)}</Text>
      </Card>
      {data.positions.length ? (
        data.positions.map((row) => (
        <Card key={row.id}>
          <View style={styles.row}>
            <Text style={styles.symbol}>{row.symbol}</Text>
            <Pill text={row.type} up={row.type === "BUY"} />
          </View>
          <Text style={styles.muted}>
            {row.product || "MIS"} · Qty {row.qty} · Avg {formatNumber(row.avg)} · LTP {formatNumber(row.ltp)}
          </Text>
          <View style={styles.row}>
            <Text style={styles.muted}>{row.strategy || row.brokerId || "dhan"}</Text>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
          </View>
          <Pressable
            style={styles.btn}
            onPress={() =>
              Alert.alert("Square off", `Close ${row.symbol} at LTP?`, [
                { text: "Keep" },
                { text: "Square off", onPress: () => void closePosition(row.id) },
              ])
            }
          >
            <Text style={styles.btnText}>Square off</Text>
          </Pressable>
        </Card>
      ))
      ) : (
        <Card>
          <Text style={styles.muted}>{data.dhanFeed?.live ? "No live Dhan positions" : "No open positions"}</Text>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4 },
  pnl: { fontSize: 28, fontWeight: "800", marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  symbol: { fontWeight: "800", fontSize: 15, flex: 1, paddingRight: 8 },
  btn: { marginTop: 10, height: 36, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  btnText: { color: "#fff", fontWeight: "700" },
});
