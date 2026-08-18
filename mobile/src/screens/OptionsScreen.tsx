import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber, formatPct } from "../theme";

export function OptionsScreen() {
  const { data, selectChain, order } = useMarket();
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
  ];
  const lot = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;

  const trade = async (option: "CE" | "PE", action: "BUY" | "SELL", row: (typeof data.optionChain)[number]) => {
    const symbol = `${meta?.symbol || "NIFTY"} ${row.strike} ${option}`;
    const ltp = option === "CE" ? row.callLtp : row.putLtp;
    const securityId = option === "CE" ? row.callId : row.putId;
    try {
      const result = await order({
        symbol,
        side: action,
        qty: lot,
        price: ltp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        securityId: securityId ? String(securityId) : undefined,
        exchangeSegment: String(meta?.symbol || "").toUpperCase().includes("SENSEX") ? "BSE_FNO" : "NSE_FNO",
      });
      if (result.live) {
        Alert.alert("Sent to Dhan", `${action} ${symbol} · ${lot} qty`);
      } else {
        Alert.alert("Desk fill only", result.warning || `${action} ${symbol} · ${lot} qty. Connect live Access Token on Brokers to send this to Dhan.`);
      }
    } catch (err) {
      Alert.alert("Order failed", err instanceof Error ? err.message : "Try again");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Option Chain</Text>
      <Text style={styles.muted}>
        {meta?.symbol || "NIFTY"} · {meta?.expiryLabel || meta?.expiry || "expiry"} · Spot {formatNumber(meta?.spot || data.indices[0]?.price || 0)} · PCR{" "}
        {meta?.pcr != null ? meta.pcr.toFixed(2) : "—"} · 1 lot = {lot}
        {"\n"}
        {data.dhanFeed?.live ? "Orders go to Dhan" : "Desk fill only until Access Token on Brokers"}
      </Text>
      <View style={styles.chips}>
        {underlyings.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => void selectChain(item.id)}
            style={[styles.chip, meta?.symbol === item.id && styles.chipOn]}
          >
            <Text style={[styles.chipText, meta?.symbol === item.id && styles.chipTextOn]}>
              {item.label} {item.lot}
            </Text>
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
            <Text style={[styles.chipText, meta?.expiry === expiry && styles.chipTextOn]}>{meta?.expiryLabels?.[expiry] || expiry}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {data.optionChain.map((row) => (
        <Card key={row.strike}>
          <Text style={styles.strike}>
            {row.strike} {row.atm ? "ATM" : ""}
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.muted}>CALL</Text>
              <Text style={styles.price}>{formatNumber(row.callLtp)}</Text>
              <Text style={styles.muted}>ID {row.callId || "—"}</Text>
              <Text style={{ color: row.callChg >= 0 ? colors.up : colors.down }}>{formatPct(row.callChg)}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => void trade("CE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Pressable style={styles.sell} onPress={() => void trade("CE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.muted}>PUT</Text>
              <Text style={styles.price}>{formatNumber(row.putLtp)}</Text>
              <Text style={styles.muted}>ID {row.putId || "—"}</Text>
              <Text style={{ color: row.putChg >= 0 ? colors.up : colors.down }}>{formatPct(row.putChg)}</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => void trade("PE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Pressable style={styles.sell} onPress={() => void trade("PE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
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
  actions: { flexDirection: "row", gap: 6, marginTop: 8 },
  buy: { backgroundColor: colors.up, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sell: { backgroundColor: colors.down, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
