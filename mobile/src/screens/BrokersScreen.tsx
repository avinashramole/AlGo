import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useState } from "react";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { colors, fundsCaption } from "../theme";

export function BrokersScreen() {
  const { data, connect, disconnect, activate } = useMarket();
  const brokers = data.brokers || [];
  const feed = data.dhanFeed;
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [dhanClientId, setDhanClientId] = useState("");
  const [dhanToken, setDhanToken] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const targetBroker = brokers.find((item) => item.id === target);
  const clientLocked = Boolean(targetBroker?.liveFeed || (targetBroker && targetBroker.id !== "dhan" && targetBroker.connected));

  const openForm = (id: string) => {
    const broker = brokers.find((item) => item.id === id);
    setTarget(id);
    if (id === "dhan") {
      setClientId(broker?.liveFeed ? broker.clientId || feed?.clientId || "" : dhanClientId || broker?.clientId || "");
      setSecret("");
    } else if (broker?.connected) {
      setClientId(broker.clientId || "");
      setSecret("");
    } else {
      setClientId("");
      setSecret("");
    }
  };

  const submit = async () => {
    if (!target) return;
    try {
      if (target === "dhan") {
        await connect("dhan", { clientId, accessToken: secret, apiKey: secret });
      } else {
        await connect(target, { clientId, apiKey: secret });
      }
      setTarget(null);
      setSecret("");
    } catch (error) {
      Alert.alert("Connect failed", error instanceof Error ? error.message : "Check Client ID and Access Token");
    }
  };

  const connectDhanCard = async () => {
    try {
      await connect("dhan", { clientId: dhanClientId, accessToken: dhanToken, apiKey: dhanToken });
      setDhanToken("");
    } catch (error) {
      Alert.alert("Connect failed", error instanceof Error ? error.message : "Check Client ID and Access Token");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Brokers</Text>
      <Text style={styles.muted}>
        Main broker is Dhan. Paper trading uses the live Dhan feed; fills stay virtual. Dhan funds are actual. Paper
        funds are virtual. BUY/SELL hits Dhan only while the Access Token is LIVE.
      </Text>
      <Card>
        <View style={styles.row}>
          <Text style={styles.name}>Dhan live feed</Text>
          <Text style={{ color: feed?.live ? colors.up : colors.muted, fontWeight: "800", fontSize: 11 }}>
            {feed?.live ? `LIVE · ${feed.source}` : "WAITING"}
          </Text>
        </View>
        <Text style={styles.muted}>
          Token {feed?.tokenHint || "not set"}
          {feed?.lastTickAt ? ` · tick ${new Date(feed.lastTickAt).toLocaleTimeString("en-IN")}` : ""}
        </Text>
        {feed?.ipCheck ? (
          <Text style={styles.muted}>
            Dhan sees {feed.ipCheck.detectedIP || "—"} · saved {feed.ipCheck.primaryIP || "—"} · orders{" "}
            {feed.ipCheck.ordersAllowed === true ? "allowed" : feed.ipCheck.ordersAllowed === false ? "blocked" : "unknown"}
          </Text>
        ) : null}
        {feed?.ipCheck?.detectedIP &&
        feed.ipCheck.primaryIP &&
        feed.ipCheck.detectedIP !== feed.ipCheck.primaryIP &&
        feed.ipCheck.detectedIP !== feed.ipCheck.secondaryIP ? (
          <Text style={{ color: colors.down, marginTop: 6, fontSize: 12 }}>
            Dhan saw {feed.ipCheck.detectedIP}, not saved {feed.ipCheck.primaryIP}. Run npm start on this PC. Do not add
            another IP.
          </Text>
        ) : null}
        {feed?.error ? <Text style={{ color: colors.down, marginTop: 6, fontSize: 12 }}>{feed.error}</Text> : null}
      </Card>
      {brokers.map((broker) => (
        <Card key={broker.id}>
          <View style={styles.row}>
            <Text style={styles.name}>{broker.name}</Text>
            <Text style={{ color: broker.liveFeed || broker.connected ? colors.up : colors.muted, fontWeight: "800", fontSize: 11 }}>
              {broker.main ? (broker.liveFeed ? "MAIN LIVE" : "MAIN") : broker.active ? "ACTIVE" : broker.status}
            </Text>
          </View>
          {broker.id === "dhan" && broker.liveFeed ? (
            <Text style={styles.muted}>
              {broker.clientId || "No client yet"} · Funds {fundsCaption(broker)}
            </Text>
          ) : broker.id !== "dhan" && broker.connected ? (
            <Text style={styles.muted}>
              {broker.clientId || "No client yet"} · Funds {fundsCaption(broker)}
            </Text>
          ) : null}
          {broker.id === "dhan" && !broker.liveFeed ? (
            <View>
              <TextInput
                style={styles.input}
                value={dhanClientId}
                onChangeText={setDhanClientId}
                placeholder="Client ID"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                value={dhanToken}
                onChangeText={setDhanToken}
                placeholder="Access token"
                autoCapitalize="none"
                secureTextEntry
              />
              <Pressable style={[styles.primary, { marginTop: 10 }]} onPress={() => void connectDhanCard()}>
                <Text style={styles.primaryText}>Connect live feed</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.actions}>
              {broker.id === "dhan" ? (
                <>
                  <Pressable style={styles.primary} onPress={() => openForm("dhan")}>
                    <Text style={styles.primaryText}>Update token</Text>
                  </Pressable>
                  {broker.liveFeed && (
                    <Pressable
                      style={styles.ghost}
                      onPress={() => {
                        const last = broker.clientId || "";
                        void disconnect("dhan").then(() => {
                          if (last) setDhanClientId(last);
                        });
                      }}
                    >
                      <Text style={styles.ghostText}>Stop live</Text>
                    </Pressable>
                  )}
                </>
              ) : broker.connected ? (
                <>
                  {!broker.active && (
                    <Pressable style={styles.primary} onPress={() => void activate(broker.id)}>
                      <Text style={styles.primaryText}>Set active</Text>
                    </Pressable>
                  )}
                  {broker.id !== "paper" && (
                    <Pressable style={styles.ghost} onPress={() => void disconnect(broker.id)}>
                      <Text style={styles.ghostText}>Disconnect</Text>
                    </Pressable>
                  )}
                </>
              ) : (
                <Pressable style={styles.primary} onPress={() => openForm(broker.id)}>
                  <Text style={styles.primaryText}>Connect sandbox</Text>
                </Pressable>
              )}
            </View>
          )}
        </Card>
      ))}
      {target && (
        <Card>
          <Text style={styles.name}>
            {target === "dhan" ? "Update Dhan access token" : `Connect ${brokers.find((item) => item.id === target)?.name}`}
          </Text>
          <TextInput
            style={[styles.input, clientLocked ? styles.locked : null]}
            value={clientId}
            onChangeText={(value) => {
              if (!clientLocked) setClientId(value);
            }}
            placeholder="Client ID"
            autoCapitalize="none"
            editable={!clientLocked}
          />
          <TextInput
            style={styles.input}
            value={secret}
            onChangeText={setSecret}
            placeholder={target === "dhan" ? "Access token" : "API key"}
            autoCapitalize="none"
            secureTextEntry
          />
          <Pressable style={styles.primary} onPress={() => void submit()}>
            <Text style={styles.primaryText}>{target === "dhan" ? "Start live feed" : "Connect"}</Text>
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
  locked: { backgroundColor: "#eef2f6", color: colors.muted },
});
