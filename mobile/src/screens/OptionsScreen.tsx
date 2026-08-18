import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber, formatPct } from "../theme";

export function OptionsScreen() {
  const { data, selectChain } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 75 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 15 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 25 },
    { id: "SENSEX", label: "SENSEX", lot: 10 },
  ];

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Option Chain</Text>
      <Text style={styles.muted}>
        {meta?.symbol || "NIFTY"} · {meta?.expiryLabel || meta?.expiry || "expiry"} · Spot {formatNumber(meta?.spot || data.indices[0]?.price || 0)} · PCR{" "}
        {meta?.pcr != null ? meta.pcr.toFixed(2) : "—"}
      </Text>
      <View style={styles.chips}>
        {underlyings.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void selectChain(item.id)}
            style={[styles.chip, meta?.symbol === item.id && styles.chipOn]}
          >
            <Text style={[styles.chipText, meta?.symbol === item.id && styles.chipTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
        {(meta?.expiries || []).map((expiry) => (
          <Pressable
            key={expiry}
            onPress={() => void selectChain(meta?.symbol || "NIFTY", expiry)}
            style={[styles.chip, meta?.expiry === expiry && styles.chipOn]}
          >
            <Text style={[styles.chipText, meta?.expiry === expiry && styles.chipTextOn]}>
              {meta?.expiryLabels?.[expiry] || expiry}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {data.optionChain.map((row) => (
        <Card key={row.strike}>
          <Text style={styles.strike}>
            {row.strike} {row.atm ? "ATM" : ""}
          </Text>
          <View style={styles.row}>
            <View>
              <Text style={styles.muted}>CALL</Text>
              <Text style={styles.price}>{formatNumber(row.callLtp)}</Text>
              <Text style={{ color: row.callChg >= 0 ? colors.up : colors.down }}>{formatPct(row.callChg)}</Text>
              {row.callOi ? <Text style={styles.muted}>OI {Math.round(row.callOi).toLocaleString("en-IN")}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.muted}>PUT</Text>
              <Text style={styles.price}>{formatNumber(row.putLtp)}</Text>
              <Text style={{ color: row.putChg >= 0 ? colors.up : colors.down }}>{formatPct(row.putChg)}</Text>
              {row.putOi ? <Text style={styles.muted}>OI {Math.round(row.putOi).toLocaleString("en-IN")}</Text> : null}
            </View>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800" },
  muted: { color: colors.muted, marginTop: 4, marginBottom: 8, fontSize: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  strike: { fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  price: { fontWeight: "800", fontSize: 16, marginTop: 4 },
});
