import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { confirmWalletTopup, getMemberDesk, installMemberBroker, selectMemberBroker, startWalletTopup, type MemberDesk } from "../api";
import { Card } from "../components/Ui";
import { colors, formatInr } from "../theme";

export function MemberPlansScreen() {
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [amount, setAmount] = useState("5000");
  const [busy, setBusy] = useState("");
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const load = useCallback(() => {
    void getMemberDesk()
      .then(setDesk)
      .catch((err) => Alert.alert("My plan", err instanceof Error ? err.message : "Could not load"));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const addBalance = async () => {
    setBusy("topup");
    try {
      const result = await startWalletTopup(Number(amount), "gpay");
      Alert.alert(`Add ${formatInr(result.topup.amount)}`, `Pay ${result.payments.payeeName} · ${result.payments.mobile} via GPay or PhonePe.`, [
        { text: "Open GPay", onPress: () => void Linking.openURL(result.links?.gpay || result.links?.upi || "").catch(() => undefined) },
        { text: "Open PhonePe", onPress: () => void Linking.openURL(result.links?.phonepe || result.links?.upi || "").catch(() => undefined) },
        {
          text: "I have paid",
          onPress: () =>
            void confirmWalletTopup(result.topup.id)
              .then(load)
              .catch((err) => Alert.alert("Wallet", err instanceof Error ? err.message : "Could not confirm")),
        },
        { text: "Close", style: "cancel" },
      ]);
    } catch (err) {
      Alert.alert("Add balance", err instanceof Error ? err.message : "Could not add");
    } finally {
      setBusy("");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My plan</Text>
      <Text style={styles.muted}>MTM, wallet add, and broker selection.</Text>
      <Card>
        <Text style={styles.label}>Wallet</Text>
        <Text style={styles.price}>{formatInr(desk?.wallet.balance || 0)}</Text>
        <Text style={styles.muted}>MTM {formatInr(desk?.wallet.mtm || 0)} · Equity {formatInr(desk?.wallet.equity || 0)}</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={amount} onChangeText={setAmount} placeholder="Amount ₹" />
        <Pressable style={styles.btn} disabled={busy === "topup"} onPress={() => void addBalance()}>
          <Text style={styles.btnText}>Add balance</Text>
        </Pressable>
      </Card>
      <Card>
        <Text style={styles.label}>Broker</Text>
        <Text style={styles.muted}>
          Paper is virtual. Other brokers are desk-managed — you do not enter API keys. A live desk broker wires this account to live auto trading.
        </Text>
        <Text style={styles.muted}>
          {desk?.autoTrade ? `Live auto trading · ${desk.brokerId}` : "Virtual paper book · not live"}
        </Text>
        <View style={styles.wrap}>
          {(desk?.brokers || []).map((row) => (
            <Pressable
              key={row.id}
              style={[styles.chip, row.selected && styles.chipOn]}
              onPress={() =>
                void selectMemberBroker(row.id)
                  .then(load)
                  .catch((err) => Alert.alert("Broker", err instanceof Error ? err.message : "Could not select"))
              }
            >
              <Text style={[styles.chipText, row.selected && styles.chipTextOn]}>
                {row.name}
                {row.virtual ? " · paper" : row.live ? " · live" : ""}
              </Text>
            </Pressable>
          ))}
        </View>
        {desk && desk.brokerId !== "paper" ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Text style={styles.muted}>
              {desk.install?.installed
                ? `Token installed ${desk.install.tokenHint || ""}`
                : "Install API key and access token. This does not start LIVE."}
            </Text>
            <TextInput style={styles.input} value={clientId} onChangeText={setClientId} placeholder="Client ID" autoCapitalize="none" />
            <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} placeholder="API key" autoCapitalize="none" secureTextEntry />
            <TextInput style={styles.input} value={accessToken} onChangeText={setAccessToken} placeholder="Access token" autoCapitalize="none" secureTextEntry />
            <Pressable
              style={styles.btn}
              disabled={busy === "creds"}
              onPress={() =>
                void installMemberBroker({ brokerId: desk.brokerId, clientId, apiKey, accessToken })
                  .then(() => {
                    setAccessToken("");
                    setApiKey("");
                    load();
                  })
                  .catch((err) => Alert.alert("Broker token", err instanceof Error ? err.message : "Could not save"))
              }
            >
              <Text style={styles.btnText}>{busy === "creds" ? "Saving..." : "Save access token"}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>
      {(desk?.plans || []).map((row) => (
        <Card key={row.strategyId}>
          <Text style={styles.name}>{row.strategyName}</Text>
          <Text style={styles.muted}>Realized {formatInr(row.realizedPnl)}</Text>
          <Text style={{ color: row.unrealizedPnl >= 0 ? colors.up : colors.down, fontWeight: "800", marginTop: 6 }}>
            MTM {formatInr(row.unrealizedPnl)}
          </Text>
        </Card>
      ))}
      {(desk?.positions || []).map((row) => (
        <Card key={row.id}>
          <Text style={styles.name}>{row.symbol}</Text>
          <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(row.pnl)}</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4 },
  label: { fontSize: 12, fontWeight: "800", color: colors.muted, textTransform: "uppercase" },
  price: { fontSize: 24, fontWeight: "800", marginTop: 6 },
  input: { marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontWeight: "700" },
  btn: { marginTop: 10, backgroundColor: colors.brand, borderRadius: 12, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { borderColor: colors.brand, backgroundColor: "#e8f1ff" },
  chipText: { fontWeight: "700", fontSize: 12, color: colors.muted },
  chipTextOn: { color: colors.brand },
  name: { fontWeight: "800", fontSize: 16 },
});
