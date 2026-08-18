import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber, formatPct } from "../theme";

export function OptionsScreen() {
  const { data } = useMarket();
  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Option Chain</Text>
      {data.optionChain.map((row) => (
        <Card key={row.strike}>
          <Text style={styles.strike}>{row.strike} {row.atm ? "ATM" : ""}</Text>
          <View style={styles.row}>
            <View>
              <Text style={styles.muted}>CALL</Text>
              <Text style={styles.price}>{formatNumber(row.callLtp)}</Text>
              <Text style={{ color: row.callChg >= 0 ? colors.up : colors.down }}>{formatPct(row.callChg)}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.muted}>PUT</Text>
              <Text style={styles.price}>{formatNumber(row.putLtp)}</Text>
              <Text style={{ color: row.putChg >= 0 ? colors.up : colors.down }}>{formatPct(row.putChg)}</Text>
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
  strike: { fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  muted: { color: colors.muted, fontSize: 11 },
  price: { fontWeight: "800", fontSize: 16, marginTop: 4 },
});
