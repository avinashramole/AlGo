import { useNavigation } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr, formatNumber, formatPct } from "../theme";

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { data, live } = useMarket();
  const signal = data.featuredSignal;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <Text style={styles.brand}>T2S</Text>
        <Text style={styles.live}>{live ? "LIVE" : "DEMO"} · {data.marketStatus}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {data.indices.map((item) => {
          const up = item.change >= 0;
          return (
            <Card key={item.symbol}>
              <View style={{ width: 150 }}>
                <Text style={styles.muted}>{item.symbol}</Text>
                <Text style={styles.price}>{formatNumber(item.price)}</Text>
                <Text style={{ color: up ? colors.up : colors.down, fontWeight: "700", fontSize: 12 }}>
                  {formatPct(item.changePct)}
                </Text>
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
  live: { color: colors.up, fontWeight: "700", fontSize: 12 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 6 },
  price: { fontSize: 18, fontWeight: "800" },
  heading: { fontSize: 16, fontWeight: "800", marginVertical: 6 },
  metrics: { flexDirection: "row", gap: 8, marginTop: 10 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 8 },
  metricVal: { color: colors.brand, fontWeight: "800", marginTop: 4 },
  cta: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700" },
  barBg: { height: 8, backgroundColor: "#e5e7eb", borderRadius: 99, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.up },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontWeight: "600" },
});
