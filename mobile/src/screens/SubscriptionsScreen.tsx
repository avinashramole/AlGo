import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import {
  confirmEnrollmentPaid,
  enrollStrategy,
  listEnrollments,
  strategyCatalog,
  type CatalogStrategy,
  type Enrollment,
  type PaymentPublic,
  type UpiLinks,
} from "../api";
import { Card } from "../components/Ui";
import { colors, formatInr } from "../theme";

export function SubscriptionsScreen() {
  const [strategies, setStrategies] = useState<CatalogStrategy[]>([]);
  const [payments, setPayments] = useState<PaymentPublic | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    void Promise.all([strategyCatalog(), listEnrollments()])
      .then(([catalog, mine]) => {
        setStrategies(catalog.strategies || []);
        setPayments(catalog.payments);
        setEnrollments(mine.enrollments || []);
      })
      .catch((err) => Alert.alert("Subscriptions", err instanceof Error ? err.message : "Could not load"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const statusFor = (id: string) => enrollments.find((row) => row.strategyId === id);

  const enroll = async (row: CatalogStrategy) => {
    setBusy(row.id);
    try {
      const result = await enrollStrategy(row.id, "gpay");
      setEnrollments((rows) => [result.enrollment, ...rows.filter((item) => item.id !== result.enrollment.id)]);
      const links = result.links;
      const payee = `${result.payments.payeeName} · ${result.payments.mobile}`;
      Alert.alert(
        `Deposit ${formatInr(result.enrollment.amount)}`,
        `Send this amount to the admin GPay / PhonePe number:\n${payee}\nUPI ${result.payments.upiId}`,
        [
          { text: "Open GPay", onPress: () => void openPay("gpay", links) },
          { text: "Open PhonePe", onPress: () => void openPay("phonepe", links) },
          {
            text: "I have paid",
            onPress: () =>
              void confirmEnrollmentPaid(result.enrollment.id)
                .then(load)
                .catch((err) => Alert.alert("Payment", err instanceof Error ? err.message : "Could not confirm")),
          },
          { text: "Close", style: "cancel" },
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
      <Text style={styles.title}>Subscriptions</Text>
      <Text style={styles.muted}>
        {payments?.ready
          ? `Money goes to ${payments.payeeName} · ${payments.mobileMasked}`
          : "Admin has not set a GPay / PhonePe number yet."}
      </Text>
      {strategies.map((row) => {
        const current = statusFor(row.id);
        return (
          <Card key={row.id}>
            <Text style={styles.name}>{row.name}</Text>
            <Text style={styles.price}>{formatInr(row.enrollFee)}</Text>
            {current?.status === "paid" ? (
              <Text style={styles.paid}>Enrolled</Text>
            ) : (
              <Pressable style={styles.gpay} disabled={Boolean(busy) || !payments?.ready} onPress={() => void enroll(row)}>
                <Text style={styles.btnText}>{current?.status === "pending" ? "Pay now" : "Enroll"}</Text>
              </Pressable>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}

async function openPay(channel: "gpay" | "phonepe", links: UpiLinks | null) {
  if (!links) return;
  const url = channel === "phonepe" ? links.phonepe : links.gpay;
  try {
    await Linking.openURL(url);
  } catch {
    await Linking.openURL(links.upi).catch(() => Alert.alert("UPI", "Open GPay or PhonePe and pay the amount shown."));
  }
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "800" },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4 },
  name: { fontWeight: "800", fontSize: 16 },
  price: { fontWeight: "800", marginTop: 8 },
  paid: { color: colors.up, fontWeight: "800", marginTop: 8 },
  gpay: { marginTop: 10, backgroundColor: colors.brand, borderRadius: 12, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
