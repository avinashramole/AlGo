import { useNavigation } from "@react-navigation/native";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr, formatNumber } from "../theme";

export function PositionsScreen() {
  const navigation = useNavigation<any>();
  const { data, closePosition } = useMarket();
  const closed = (data.closedTrades || []).map((row) => ({
    id: row.id,
    symbol: row.symbol,
    type: (row.type || row.side || "BUY") as "BUY" | "SELL",
    qty: row.qty,
    avg: row.entry,
    ltp: row.exit,
    pnl: row.pnl,
    product: row.product,
    strategy: row.strategy,
    brokerId: row.brokerId,
    closed: true,
  }));
  const rows = [...(data.positions || []).map((row) => ({ ...row, closed: false })), ...closed];
  const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);
  const invested = (data.positions || []).reduce((sum, row) => sum + row.avg * row.qty, 0);
  const connected = (data.brokers || []).filter((item) => item.connected);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Position</Text>
      <Text style={styles.muted}>
        {data.dhanFeed?.live
          ? "LIVE feed · Dhan actual + Paper virtual. Closed P&L stays on this book."
          : "Portfolio, open book, and closed P&L"}
      </Text>
      <Card>
        <Text style={styles.muted}>DAY P&L · MTM</Text>
        <Text style={[styles.pnl, { color: (data.totalPnl || pnl) >= 0 ? colors.up : colors.down }]}>
          {formatInr(data.totalPnl || pnl)}
        </Text>
        <Text style={styles.muted}>
          Invested ₹{formatNumber(invested)} · {connected.length} broker{connected.length === 1 ? "" : "s"}
        </Text>
      </Card>
      {connected.map((broker) => (
        <Card key={broker.id}>
          <Text style={styles.muted}>{broker.name}</Text>
          <Text style={{ color: (data.pnlByBroker?.[broker.id] || 0) >= 0 ? colors.up : colors.down, fontWeight: "800" }}>
            {formatInr(data.pnlByBroker?.[broker.id] || 0)}
          </Text>
        </Card>
      ))}
      {rows.length ? (
        rows.map((row) => (
          <Card key={row.id}>
            <View style={styles.row}>
              <Text style={styles.symbol}>{row.symbol}</Text>
              <Pill text={row.closed ? "CLOSED" : row.type} up={!row.closed && row.type === "BUY"} />
            </View>
            <Text style={styles.muted}>
              {row.product || "MIS"} · Qty {row.qty} · Avg {formatNumber(row.avg)} · LTP {formatNumber(row.ltp)}
            </Text>
            <View style={styles.row}>
              <Text style={styles.muted}>{row.strategy || row.brokerId || "dhan"}</Text>
              <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
            </View>
            {row.closed ? null : (
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
            )}
          </Card>
        ))
      ) : (
        <Card>
          <Text style={styles.muted}>
            {data.dhanFeed?.live ? "No live Dhan, paper, or closed positions" : "No open or closed positions"}
          </Text>
        </Card>
      )}
      <Pressable onPress={() => navigation.navigate("Orders")}>
        <Text style={styles.link}>Order book →</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("Report")}>
        <Text style={styles.link}>Report →</Text>
      </Pressable>
      <Pressable onPress={() => navigation.navigate("Brokers")}>
        <Text style={styles.link}>Brokers →</Text>
      </Pressable>
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
  link: { color: colors.brand, fontWeight: "700", marginTop: 12 },
});
