import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber, formatPct } from "../theme";

export function MarketsScreen() {
  const { data } = useMarket();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Markets</Text>
      {data.marketWatch.map((row) => (
        <Card key={row.symbol}>
          <View style={styles.row}>
            <View>
              <Text style={styles.symbol}>{row.symbol}</Text>
              <Text style={styles.muted}>{row.volume}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.price}>{formatNumber(row.ltp)}</Text>
              <Text style={{ color: row.chg >= 0 ? colors.up : colors.down, fontWeight: "700" }}>{formatPct(row.chg)}</Text>
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  symbol: { fontWeight: "800", fontSize: 16 },
  muted: { color: colors.muted, marginTop: 4, fontSize: 12 },
  price: { fontWeight: "800", fontSize: 16 },
});
