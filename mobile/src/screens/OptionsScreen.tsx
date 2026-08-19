import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber, formatPct, vwapColor } from "../theme";

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
  const futures = (data.futures || []).filter(
    (row) =>
      row.front && (!meta?.symbol || row.root === meta.symbol || row.symbol.startsWith(meta.symbol)),
  );
  const visibleRows = useMemo(() => {
    const rows = data.optionChain || [];
    const atm = rows.findIndex((row) => row.atm);
    if (atm < 0) return rows.slice(0, 21);
    return rows.slice(Math.max(0, atm - 10), atm + 11);
  }, [data.optionChain]);

  const trade = async (option: "CE" | "PE", action: "BUY" | "SELL", row: (typeof data.optionChain)[number]) => {
    const symbol = `${meta?.symbol || "NIFTY"} ${row.strike} ${option}`;
    const ltp = option === "CE" ? row.callLtp : row.putLtp;
    try {
      const result = await order({
        symbol,
        side: action,
        qty: lot,
        price: ltp,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        kind: "option",
        option,
        strike: row.strike,
        expiry: meta?.expiry,
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

  const tradeFuture = async (row: NonNullable<typeof data.futures>[number], side: "BUY" | "SELL") => {
    try {
      const result = await order({
        symbol: row.symbol,
        name: row.name,
        kind: "future",
        side,
        qty: row.qty || row.lot || lot,
        product: "MIS",
        type: "MARKET",
        brokerId: data.activeBrokerId,
        expiry: row.expiry,
        exchangeSegment: row.segment,
      });
      Alert.alert(result.live ? "Sent to Dhan" : "Desk fill", `${side} ${row.name || row.symbol}`);
    } catch (err) {
      Alert.alert("Order failed", err instanceof Error ? err.message : "Try again");
    }
  };

  return (
    <View style={styles.page}>
      <View style={styles.head}>
      <Text style={styles.title}>Option Chain</Text>
      <Text style={styles.muted}>
        {meta?.symbol || "NIFTY"} · {meta?.expiryLabel || meta?.expiry || "expiry"} · Spot {formatNumber(meta?.spot || data.indices[0]?.price || 0)} · PCR{" "}
        {meta?.pcr != null ? meta.pcr.toFixed(2) : "—"} · 1 lot = {lot}
        {"\n"}
        {data.dhanFeed?.live ? "Orders go to Dhan. The desk looks up the live contract." : "Desk fill only until Access Token on Brokers"}
        {" · ATM ±10"}
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
      {futures.map((row) => {
        const index =
          data.indices.find((item) => item.symbol === row.parent) ||
          data.indices.find((item) => item.symbol === row.root) ||
          data.indices.find((item) => row.root === "NIFTY" && item.symbol === "NIFTY 50");
        const ltp = Number(index?.future) > 0 ? Number(index?.future) : Number(index?.price) || 0;
        const vwap = Number(index?.futureVwap || index?.vwap) > 0 ? Number(index?.futureVwap || index?.vwap) : ltp;
        return (
          <Card key={`${row.root}-${row.expiry}`}>
            <Text style={styles.strike}>{row.name || row.symbol}</Text>
            <Text style={styles.muted}>{row.segment} · lot {row.lot}</Text>
            <View style={styles.actions}>
              <Text style={styles.price}>{formatNumber(ltp)}</Text>
              <Text style={[styles.vwap, { color: vwapColor(vwap, ltp) }]}>{formatNumber(vwap)}</Text>
              <Pressable style={styles.buy} onPress={() => void tradeFuture(row, "BUY")}>
                <Text style={styles.actionText}>BUY</Text>
              </Pressable>
              <Pressable style={styles.sell} onPress={() => void tradeFuture(row, "SELL")}>
                <Text style={styles.actionText}>SELL</Text>
              </Pressable>
            </View>
          </Card>
        );
      })}
      </View>
      <ScrollView style={styles.chain} contentContainerStyle={styles.chainContent}>
      {visibleRows.map((row) => (
        <Card key={row.strike}>
          <Text style={styles.strike}>
            {row.strike} {row.atm ? "ATM" : ""}
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.muted}>CALL</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => void trade("CE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Text style={[styles.vwap, { color: vwapColor(row.callVwap || row.callLtp, row.callLtp) }]}>
                  {formatNumber(row.callVwap || row.callLtp)}
                </Text>
                <Text style={styles.price}>{formatNumber(row.callLtp)}</Text>
                <Pressable style={styles.sell} onPress={() => void trade("CE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
              <Text style={{ color: row.callChg >= 0 ? colors.up : colors.down }}>{formatPct(row.callChg)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.muted}>PUT</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => void trade("PE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Text style={[styles.vwap, { color: vwapColor(row.putVwap || row.putLtp, row.putLtp) }]}>
                  {formatNumber(row.putVwap || row.putLtp)}
                </Text>
                <Text style={styles.price}>{formatNumber(row.putLtp)}</Text>
                <Pressable style={styles.sell} onPress={() => void trade("PE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
              <Text style={{ color: row.putChg >= 0 ? colors.up : colors.down }}>{formatPct(row.putChg)}</Text>
            </View>
          </View>
        </Card>
      ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  head: { paddingHorizontal: 16, paddingTop: 16 },
  chain: { flex: 1, minHeight: 0 },
  chainContent: { paddingHorizontal: 16, paddingBottom: 40 },
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
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  price: { fontWeight: "800", fontSize: 16 },
  vwap: { fontWeight: "600", fontSize: 12, color: colors.muted },
  buy: { backgroundColor: colors.up, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sell: { backgroundColor: colors.down, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
