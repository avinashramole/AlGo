import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors } from "../theme";

export function SignalsScreen() {
  const { data } = useMarket();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Signals</Text>
      {data.signals.map((signal) => (
        <Card key={signal.id}>
          <View style={styles.row}>
            <Pill text={signal.action} up={signal.action === "BUY"} />
            <Text style={styles.conf}>{signal.confidence}%</Text>
          </View>
          <Text style={styles.symbol}>{signal.symbol}</Text>
          <Text style={styles.muted}>
            {signal.strategy} · {signal.time}
          </Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  conf: { color: colors.brand, fontWeight: "800" },
  symbol: { fontWeight: "800", fontSize: 16, marginTop: 8 },
  muted: { color: colors.muted, marginTop: 4, fontSize: 12 },
});
