import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatInr } from "../theme";

export function ReportScreen() {
  const { data } = useMarket();
  const report = data.report;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Report</Text>
      {!report ? (
        <Card>
          <Text style={styles.muted}>Report loads from the API snapshot.</Text>
        </Card>
      ) : (
        <>
          <Card>
            <Text style={styles.muted}>NET P&L · {report.date}</Text>
            <Text style={[styles.pnl, { color: report.netPnl >= 0 ? colors.up : colors.down }]}>{formatInr(report.netPnl)}</Text>
            <Text style={styles.muted}>
              Realized {formatInr(report.realizedPnl)} · Open {formatInr(report.unrealizedPnl)} · Charges {formatInr(report.charges)}
            </Text>
          </Card>
          <Card>
            <Text style={styles.label}>Win rate {report.winRate}%</Text>
            <Text style={styles.muted}>
              {report.trades} closed trades · {report.wins} wins · {report.losses} losses
            </Text>
          </Card>
          {(report.byStrategy || []).map((row) => (
            <Card key={row.name}>
              <View style={styles.row}>
                <Text style={styles.symbol}>{row.name}</Text>
                <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
              </View>
              <Text style={styles.muted}>
                {row.trades} trades · {row.winRate}% win
              </Text>
            </Card>
          ))}
          <Text style={styles.section}>Trade book</Text>
          {(report.tradeBook || []).map((row) => (
            <Card key={row.id}>
              <View style={styles.row}>
                <Text style={styles.symbol}>{row.symbol}</Text>
                <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
              </View>
              <Text style={styles.muted}>
                {row.side} {row.qty} · {row.entry} → {row.exit} · {row.strategy || "Manual"}
              </Text>
            </Card>
          ))}
        </>
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
  label: { fontWeight: "800", fontSize: 16 },
  section: { fontWeight: "800", fontSize: 16, marginBottom: 8, marginTop: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  symbol: { fontWeight: "800", fontSize: 15, flex: 1, paddingRight: 8 },
});
