import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import {
  abandonEnrollment,
  claimEnrollmentPaid,
  enrollStrategy,
  getMemberDesk,
  installMemberBroker,
  listEnrollments,
  selectMemberBroker,
  strategyCatalog,
  type CatalogStrategy,
  type Enrollment,
  type MemberDesk,
  type PlanTerm,
} from "../api";
import { Card } from "../components/Ui";
import { colors, formatInr, formatIstDate, formatPlanTerm } from "../theme";

const TERMS: PlanTerm[] = ["monthly", "quarterly", "yearly"];

export function MemberPlansScreen() {
  const [desk, setDesk] = useState<MemberDesk | null>(null);
  const [strategies, setStrategies] = useState<CatalogStrategy[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [busy, setBusy] = useState("");
  const [terms, setTerms] = useState<Record<string, PlanTerm>>({});
  const [clientId, setClientId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const load = useCallback(() => {
    void Promise.all([getMemberDesk(), strategyCatalog(), listEnrollments()])
      .then(([nextDesk, catalog, mine]) => {
        setDesk(nextDesk);
        setStrategies(catalog.strategies || []);
        setEnrollments(mine.enrollments || []);
      })
      .catch((err) => Alert.alert("My plan", err instanceof Error ? err.message : "Could not load"));
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);

  const termFor = (id: string): PlanTerm => terms[id] || "monthly";
  const feeFor = (row: CatalogStrategy, term: PlanTerm) =>
    row.terms?.[term] ?? row.enrollFee * ({ monthly: 1, quarterly: 3, yearly: 12 }[term]);
  const activeFor = (id: string) => enrollments.find((row) => row.strategyId === id && row.status === "paid" && row.active !== false);
  const claimedFor = (id: string) => enrollments.find((row) => row.strategyId === id && row.status === "claimed");

  const enroll = async (row: CatalogStrategy) => {
    setBusy(row.id);
    try {
      const result = await enrollStrategy(row.id, "gpay", termFor(row.id));
      setEnrollments((rows) => [result.enrollment, ...rows.filter((item) => item.id !== result.enrollment.id)]);
      if (result.already) return;
      const links = result.links;
      const payee = `${result.payments.payeeName} · ${result.payments.mobile}`;
      Alert.alert(
        `Deposit ${formatInr(result.enrollment.amount)}`,
        `Send this ${formatPlanTerm(result.enrollment.term).toLowerCase()} amount to the admin GPay / PhonePe number:\n${payee}\nUPI ${result.payments.upiId}`,
        [
          { text: "Open GPay", onPress: () => void openPay("gpay", links) },
          { text: "Open PhonePe", onPress: () => void openPay("phonepe", links) },
          {
            text: "I have paid",
            onPress: () =>
              void claimEnrollmentPaid(result.enrollment.id)
                .then(load)
                .catch((err) => Alert.alert("Payment", err instanceof Error ? err.message : "Could not send claim")),
          },
          {
            text: "Close",
            style: "cancel",
            onPress: () =>
              void abandonEnrollment(result.enrollment.id)
                .then(load)
                .catch(() => undefined),
          },
        ],
      );
    } catch (err) {
      Alert.alert("Enroll", err instanceof Error ? err.message : "Could not enroll");
    } finally {
      setBusy("");
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>My plan</Text>
      <Text style={styles.muted}>Subscriptions, MTM, and your broker token. I have paid waits for admin before live copy starts.</Text>
      <Card>
        <Text style={styles.label}>Wallet</Text>
        <Text style={styles.price}>{formatInr(desk?.wallet.balance || 0)}</Text>
        <Text style={styles.muted}>MTM {formatInr(desk?.wallet.mtm || 0)} · Equity {formatInr(desk?.wallet.equity || 0)}</Text>
      </Card>
      <Card>
        <Text style={styles.label}>Subscriptions</Text>
        <Text style={styles.muted}>
          {desk?.payments.ready
            ? `Money goes to ${desk.payments.payeeName} · ${desk.payments.mobileMasked}`
            : "Admin has not set a GPay / PhonePe number yet."}
        </Text>
        {strategies.map((row) => {
          const current = activeFor(row.id);
          const waiting = claimedFor(row.id);
          const selected = termFor(row.id);
          return (
            <View key={row.id} style={{ marginTop: 12 }}>
              <Text style={styles.name}>{row.name}</Text>
              {current ? (
                <Text style={styles.paid}>
                  Enrolled · {formatPlanTerm(current.term)} · started {formatIstDate(current.startedAt)} · ends {formatIstDate(current.endsAt)}
                </Text>
              ) : waiting ? (
                <Text style={styles.waiting}>Waiting for admin{waiting.utr ? ` · UTR ${waiting.utr}` : ""}</Text>
              ) : (
                <>
                  <View style={styles.wrap}>
                    {TERMS.map((term) => (
                      <Pressable
                        key={term}
                        style={[styles.chip, selected === term && styles.chipOn]}
                        onPress={() => setTerms((currentTerms) => ({ ...currentTerms, [row.id]: term }))}
                      >
                        <Text style={[styles.chipText, selected === term && styles.chipTextOn]}>
                          {formatPlanTerm(term)} {formatInr(feeFor(row, term))}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Pressable style={styles.btn} disabled={Boolean(busy) || !desk?.payments.ready} onPress={() => void enroll(row)}>
                    <Text style={styles.btnText}>{busy === row.id ? "Opening..." : "Enroll"}</Text>
                  </Pressable>
                </>
              )}
            </View>
          );
        })}
      </Card>
      <Card>
        <Text style={styles.label}>Broker</Text>
        <Text style={styles.muted}>
          Paper is virtual. Live brokers use your own API key and access token for copy trades. Saving a token does not start desk LIVE.
        </Text>
        <Text style={styles.muted}>
          {desk?.copyReady
            ? `Live copy ready · ${desk.brokerId} uses your token`
            : desk?.autoTrade
              ? "Broker selected · waiting for admin payment confirm and token"
              : "Virtual paper book · not live"}
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
          <Text style={styles.muted}>
            {formatPlanTerm(row.term)} · started {formatIstDate(row.startedAt)} · ends {formatIstDate(row.endsAt)}
          </Text>
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

async function openPay(channel: "gpay" | "phonepe", links: { gpay?: string; phonepe?: string; upi?: string } | null) {
  if (!links) return;
  const url = channel === "phonepe" ? links.phonepe : links.gpay;
  try {
    await Linking.openURL(url || "");
  } catch {
    await Linking.openURL(links.upi || "").catch(() => Alert.alert("UPI", "Open GPay or PhonePe and pay the amount shown."));
  }
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
  paid: { color: colors.up, fontWeight: "800", marginTop: 8 },
  waiting: { color: "#b45309", fontWeight: "800", marginTop: 8 },
});
