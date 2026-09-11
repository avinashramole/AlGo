import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors } from "../theme";

export function TradeScreen() {
  const { data, order } = useMarket();
  const signal = data.featuredSignal;
  const live = Boolean(signal?.symbol);

  const submit = async () => {
    if (!live) return;
    try {
      const result = await order({
        symbol: signal.symbol,
        side: signal.action,
        qty: 65,
        price: 142.75,
        brokerId: data.activeBrokerId,
      });
      if (result.live) {
        Alert.alert("Sent to Dhan", `${signal.action} ${signal.symbol} 65 qty`);
      } else {
        Alert.alert("Desk fill only", result.warning || `${signal.action} ${signal.symbol} 65 qty`);
      }
    } catch (err) {
      Alert.alert("Order failed", err instanceof Error ? err.message : "Try again");
    }
  };

  return (
    <View style={styles.page}>
      <Card>
        <Text style={styles.muted}>REVIEW TRADE</Text>
        <Text style={styles.title}>
          {live ? `${signal.action} ${signal.symbol}` : "No live signal"}
        </Text>
        <Text style={styles.muted}>
          {live
            ? `${data.brokers?.find((item) => item.active)?.name || "Paper"} · MIS · MARKET · 65 qty · Confidence ${signal.confidence}%`
            : "Wait for a live BUY or SELL before placing from this ticket."}
        </Text>
      </Card>
      <Pressable style={[styles.cta, !live && { opacity: 0.5 }]} onPress={() => void submit()}>
        <Text style={styles.ctaText}>{live ? "Place Order" : "Waiting"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  muted: { color: colors.muted, fontSize: 12 },
  title: { fontSize: 22, fontWeight: "800", marginVertical: 8 },
  cta: { height: 48, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700" },
});
