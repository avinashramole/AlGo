import { useNavigation } from "@react-navigation/native";
import { Alert, ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { useAuth } from "../AuthContext";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr, formatNumber, formatPct, isNseSessionOpen, vwapColor } from "../theme";

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { data, live, order } = useMarket();
  const signal = data.featuredSignal;
  const tradeFuture = async (item: (typeof data.indices)[number], side: "BUY" | "SELL") => {
    const root = item.symbol === "NIFTY 50" ? "NIFTY" : item.symbol;
    try {
      const result = await order({
        symbol: `${root} FUT`,
        kind: "future",
        side,
        qty: item.lot || 65,
        price: item.future || item.price,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        expiry: item.futureExpiry,
      });
      Alert.alert(result.live ? "Sent to Dhan" : "Desk fill", `${side} ${root} FUT`);
    } catch (err) {
      Alert.alert("Order failed", err instanceof Error ? err.message : "Try again");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.navigate("Profile")}>
          <Text style={styles.brand}>Trade 2 Smart</Text>
          <Text style={styles.user}>{user?.name || "Trader"} · {user?.email || user?.mobile || "Profile"}</Text>
        </Pressable>
        <Text style={[styles.live, !isNseSessionOpen() && { color: colors.muted }]}>
          {isNseSessionOpen() ? "Market Open" : "Market Closed"}
          {data.dhanFeed?.live ? " · DHAN LIVE" : live ? " · LIVE" : " · DEMO"}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {data.indices.map((item) => {
          const up = item.change >= 0;
          const showDeriv = item.symbol !== "INDIA VIX";
          return (
            <Card key={item.symbol}>
              <View style={{ width: 168 }}>
                <Text style={styles.muted}>{item.symbol}</Text>
                <Text style={styles.price}>{formatNumber(item.price)}</Text>
                <Text style={{ color: up ? colors.up : colors.down, fontWeight: "700", fontSize: 12 }}>
                  {`${up ? "+" : ""}${formatNumber(item.change)}`} ({formatPct(item.changePct)}) today
                </Text>
                {showDeriv ? (
                  <View style={styles.deskRow}>
                    <View>
                      <Text style={styles.tiny}>FUT</Text>
                      <Text style={styles.deskVal}>{formatNumber(item.future || item.price)}</Text>
                    </View>
                    <View>
                      <Text style={styles.tiny}>VWAP</Text>
                      <Text style={[styles.deskVal, { color: vwapColor(item.vwap || item.price, item.price) }]}>
                        {formatNumber(item.vwap || item.price)}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {showDeriv ? (
                  <View style={styles.deskRow}>
                    <Pressable style={styles.buy} onPress={() => void tradeFuture(item, "BUY")}>
                      <Text style={styles.ctaText}>BUY FUT</Text>
                    </Pressable>
                    <Pressable style={styles.sell} onPress={() => void tradeFuture(item, "SELL")}>
                      <Text style={styles.ctaText}>SELL</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Card>
        <Text style={styles.muted}>AI SIGNAL</Text>
        <Pill text={signal.action} up={signal.action === "BUY"} />
        <Text style={styles.heading}>{signal.symbol}</Text>
        <Text style={styles.muted}>
          {signal.strategy} · {signal.confidence}% confidence · Risk {signal.risk}
        </Text>
        <View style={styles.metrics}>
          {signal.metrics.map((item) => (
            <View key={item.label} style={styles.metric}>
              <Text style={styles.muted}>{item.label}</Text>
              <Text style={styles.metricVal}>{item.value}%</Text>
            </View>
          ))}
        </View>
        <Pressable style={styles.cta} onPress={() => navigation.navigate("Trade")}>
          <Text style={styles.ctaText}>Review Trade</Text>
        </Pressable>
      </Card>
      <Card>
        <Text style={styles.heading}>Sentiment {data.sentiment}/100 BULLISH</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${data.sentiment}%` }]} />
        </View>
      </Card>
      <Card>
        <Text style={styles.heading}>Positions · {formatInr(data.totalPnl)}</Text>
        {data.positions.slice(0, 4).map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowTitle}>{row.symbol}</Text>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "700" }}>{formatInr(row.pnl)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  brand: { fontSize: 22, fontWeight: "800" },
  user: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 2 },
  live: { color: colors.up, fontWeight: "700", fontSize: 12 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 6 },
  price: { fontSize: 18, fontWeight: "800" },
  deskRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12 },
  tiny: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  deskVal: { fontWeight: "800", fontSize: 13, marginTop: 2 },
  heading: { fontSize: 16, fontWeight: "800", marginVertical: 6 },
  metrics: { flexDirection: "row", gap: 8, marginTop: 10 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 8 },
  metricVal: { color: colors.brand, fontWeight: "800", marginTop: 4 },
  cta: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700" },
  buy: { flex: 1, height: 32, borderRadius: 8, backgroundColor: colors.up, alignItems: "center", justifyContent: "center" },
  sell: { flex: 1, height: 32, borderRadius: 8, backgroundColor: colors.down, alignItems: "center", justifyContent: "center" },
  barBg: { height: 8, backgroundColor: "#e5e7eb", borderRadius: 99, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.up },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontWeight: "600" },
});
