import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, formatNumber } from "../theme";

export function BrokersScreen() {
  const { data, connect, disconnect, activate } = useMarket();
  const brokers = data.brokers || [];
  const [clientId, setClientId] = useState("demo");
  const [apiKey, setApiKey] = useState("demo123");
  const [target, setTarget] = useState<string | null>(null);

  const submit = async () => {
    if (!target) return;
    try {
      await connect(target, { clientId, apiKey });
      setTarget(null);
    } catch (error) {
      Alert.alert("Connect failed", error instanceof Error ? error.message : "Try demo / demo123");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Brokers</Text>
      <Text style={styles.muted}>Main broker is Dhan. Also connect Zerodha, Kotak Neo, and Fyers.</Text>
      {brokers.map((broker) => (
        <Card key={broker.id}>
          <View style={styles.row}>
            <Text style={styles.name}>{broker.name}</Text>
            <Text style={{ color: broker.connected ? colors.up : colors.muted, fontWeight: "800", fontSize: 11 }}>
              {broker.main ? "MAIN" : broker.active ? "ACTIVE" : broker.status}
            </Text>
          </View>
          {broker.connected && (
            <Text style={styles.muted}>
              {broker.clientId} · Funds ₹{formatNumber(broker.funds, 0)}
            </Text>
          )}
          <View style={styles.actions}>
            {broker.connected ? (
              <>
                {!broker.active && (
                  <Pressable style={styles.primary} onPress={() => void activate(broker.id)}>
                    <Text style={styles.primaryText}>Set active</Text>
                  </Pressable>
                )}
                {broker.id !== "paper" && !broker.main && (
                  <Pressable style={styles.ghost} onPress={() => void disconnect(broker.id)}>
                    <Text style={styles.ghostText}>Disconnect</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <Pressable style={styles.primary} onPress={() => setTarget(broker.id)}>
                <Text style={styles.primaryText}>Connect sandbox</Text>
              </Pressable>
            )}
          </View>
        </Card>
      ))}
      {target && (
        <Card>
          <Text style={styles.name}>Connect {brokers.find((item) => item.id === target)?.name}</Text>
          <TextInput style={styles.input} value={clientId} onChangeText={setClientId} placeholder="Client ID" autoCapitalize="none" />
          <TextInput style={styles.input} value={apiKey} onChangeText={setApiKey} placeholder="API key" autoCapitalize="none" />
          <Pressable style={styles.primary} onPress={() => void submit()}>
            <Text style={styles.primaryText}>Connect</Text>
          </Pressable>
          <Pressable onPress={() => setTarget(null)}>
            <Text style={[styles.muted, { marginTop: 8 }]}>Cancel</Text>
          </Pressable>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800" },
  muted: { color: colors.muted, marginTop: 4, marginBottom: 10, fontSize: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "800", fontSize: 16 },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  primary: { flex: 1, height: 40, borderRadius: 10, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "700" },
  ghost: { flex: 1, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  ghostText: { fontWeight: "700" },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    backgroundColor: colors.bg,
  },
});
