import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { ScrollView, StyleSheet, Text, Pressable, View } from "react-native";
import { getMemberDesk, getMemberQuotes, type MemberDesk, type MemberIndexQuote } from "../api";
import { useAuth } from "../AuthContext";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { BrandMark } from "../components/BrandMark";
import { colors, formatInr, formatIst, formatNumber, formatPct, hasDhanQuotes, isMcxSessionOpen, isNseSessionOpen, vwapColor } from "../theme";

function MemberHome() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [indices, setIndices] = useState<MemberIndexQuote[]>([]);
  const [desk, setDesk] = useState<MemberDesk | null>(null);

  useEffect(() => {
    const load = () => {
      void Promise.all([getMemberQuotes(), getMemberDesk()])
        .then(([quotes, nextDesk]) => {
          setIndices(quotes.indices || []);
          setDesk(nextDesk);
        })
        .catch(() => undefined);
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <BrandMark variant="horizontal" />
      <Text style={styles.user}>Welcome, {user?.name || "trader"}</Text>
      <Text style={styles.muted}>Price and future only. VWAP is hidden. Open positions, MTM, and closed trades are below.</Text>
      {indices.map((item) => {
        const up = item.change >= 0;
        return (
          <Card key={item.symbol}>
            <Text style={styles.muted}>{item.symbol}</Text>
            <Text style={styles.price}>{formatNumber(item.price)}</Text>
            <Text style={{ color: up ? colors.up : colors.down, fontWeight: "700", fontSize: 12 }}>
              {`${up ? "+" : ""}${formatNumber(item.change)}`} ({formatPct(item.changePct)}) today
            </Text>
            <View style={styles.deskRow}>
              <View>
                <Text style={styles.tiny}>FUTURE</Text>
                <Text style={styles.deskVal}>{formatNumber(item.future || item.price)}</Text>
                <Text style={styles.tiny}>{item.futureExpiry || ""}</Text>
              </View>
              <View>
                <Text style={styles.tiny}>LOT</Text>
                <Text style={styles.deskVal}>{item.lot ? `1 lot = ${item.lot}` : "—"}</Text>
              </View>
            </View>
          </Card>
        );
      })}
      <Card>
        <Text style={styles.tiny}>OPEN MTM</Text>
        <Text style={[styles.price, { color: (desk?.wallet.mtm || 0) >= 0 ? colors.up : colors.down }]}>
          {formatInr(desk?.wallet.mtm || 0)}
        </Text>
        <Text style={styles.muted}>
          Realized {formatInr(desk?.report.realizedPnl || 0)} · Net {formatInr(desk?.report.netPnl || 0)}
        </Text>
      </Card>
      <Card>
        <Text style={styles.heading}>Open positions · MTM</Text>
        {(desk?.positions || []).map((row) => (
          <View key={row.id} style={styles.row}>
            <View>
              <Text style={styles.rowTitle}>{row.symbol}</Text>
              <Text style={styles.tiny}>
                {row.strategy} · {row.qty} qty · LTP {formatNumber(row.ltp)}
              </Text>
            </View>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "700" }}>{formatInr(row.pnl)}</Text>
          </View>
        ))}
        {!(desk?.positions || []).length ? <Text style={styles.muted}>No open positions.</Text> : null}
      </Card>
      <Card>
        <Text style={styles.heading}>Trade book</Text>
        <Text style={styles.muted}>Closed trades with entry, exit, and P&L.</Text>
        {(desk?.report.tradeBook || []).map((row) => (
          <View key={row.id} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{row.symbol}</Text>
              <Text style={styles.tiny}>
                {row.side} · {row.qty} · {formatIst(row.closedAt)}
              </Text>
              <Text style={styles.tiny}>
                Entry {formatNumber(row.entry)} · Exit {formatNumber(row.exit)}
              </Text>
            </View>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "700" }}>{formatInr(row.pnl)}</Text>
          </View>
        ))}
        {!(desk?.report.tradeBook || []).length ? <Text style={styles.muted}>No closed trades yet.</Text> : null}
      </Card>
      <Card>
        <Text style={styles.price}>{user?.email || "Gmail account"}</Text>
        <Text style={styles.tiny}>Role: member</Text>
      </Card>
      <Pressable style={{ marginTop: 12 }} onPress={() => navigation.navigate("My plan")}>
        <Text style={{ color: colors.brand, fontWeight: "800" }}>Plan report · MTM</Text>
      </Pressable>
      <Pressable style={{ marginTop: 12 }} onPress={() => navigation.navigate("Profile")}>
        <Text style={{ color: colors.brand, fontWeight: "800" }}>Open profile</Text>
      </Pressable>
    </ScrollView>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { data, live } = useMarket();
  const signal = data.featuredSignal;
  if (user?.role !== "admin") {
    return <MemberHome />;
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.top}>
        <Pressable onPress={() => navigation.navigate("Profile")}>
          <BrandMark variant="horizontal" />
          <Text style={styles.user}>{user?.name || "Trader"} · {user?.email || user?.mobile || "Profile"}</Text>
        </Pressable>
        <Text style={[styles.live, !(isNseSessionOpen() || isMcxSessionOpen()) && { color: colors.muted }]}>
          {isNseSessionOpen() && isMcxSessionOpen()
            ? "Market Open"
            : isNseSessionOpen()
              ? "NSE Open"
              : isMcxSessionOpen()
                ? "MCX Open"
                : "Market Closed"}
          {hasDhanQuotes(data) ? (data.dhanFeed?.live ? " · DHAN LIVE" : " · DHAN") : live ? " · LIVE" : " · DEMO"}
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        {data.indices.map((item) => {
          const up = item.change >= 0;
          const showDeriv = item.symbol !== "INDIA VIX";
          return (
            <Card key={item.symbol}>
              <View style={{ width: 200 }}>
                <Text style={styles.muted}>{item.symbol}</Text>
                <Text style={styles.price}>{formatNumber(item.price)}</Text>
                <Text style={{ color: up ? colors.up : colors.down, fontWeight: "700", fontSize: 12 }}>
                  {`${up ? "+" : ""}${formatNumber(item.change)}`} ({formatPct(item.changePct)}) today
                </Text>
                {showDeriv ? (
                  <View style={styles.deskRow}>
                    <View>
                      <Text style={styles.tiny}>FUT</Text>
                      <Text style={styles.deskVal}>{formatNumber(item.future || item.price)}</Text>
                    </View>
                    <View>
                      <Text style={styles.tiny}>VWAP</Text>
                      <Text style={[styles.deskVal, { color: vwapColor(Number(item.futureVwap || item.vwap), item.future || item.price) }]}>
                        {Number(item.futureVwap || item.vwap) > 0 ? formatNumber(Number(item.futureVwap || item.vwap)) : "—"}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.tiny}>LOT</Text>
                      <Text style={styles.deskVal}>{item.lot ? `1 = ${item.lot}` : "—"}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </Card>
          );
        })}
      </ScrollView>
      <Card>
        <Text style={styles.muted}>AI SIGNAL</Text>
        <Pill text={signal.symbol ? signal.action : "WAIT"} up={signal.action === "BUY"} />
        <Text style={styles.heading}>{signal.symbol || "No live signal"}</Text>
        <Text style={styles.muted}>
          {signal.symbol
            ? `${signal.strategy} · ${signal.confidence}% confidence · Risk ${signal.risk}`
            : "Start an algo or wait for a Dhan fill"}
        </Text>
        <View style={styles.metrics}>
          {signal.metrics.map((item) => (
            <View key={item.label} style={styles.metric}>
              <Text style={styles.muted}>{item.label}</Text>
              <Text style={styles.metricVal}>{item.value}%</Text>
            </View>
          ))}
        </View>
        <Pressable style={styles.cta} onPress={() => navigation.navigate("Trade")}>
          <Text style={styles.ctaText}>Review Trade</Text>
        </Pressable>
      </Card>
      <Card>
        <Text style={styles.heading}>Sentiment {data.sentiment}/100 BULLISH</Text>
        <View style={styles.barBg}>
          <View style={[styles.barFill, { width: `${data.sentiment}%` }]} />
        </View>
      </Card>
      <Card>
        <Text style={styles.heading}>Position · {formatInr(data.totalPnl)}</Text>
        {[
          ...(data.positions || []),
          ...(data.closedTrades || []).map((row) => ({
            id: row.id,
            symbol: row.symbol,
            pnl: row.pnl,
          })),
        ]
          .slice(0, 4)
          .map((row) => (
          <View key={row.id} style={styles.row}>
            <Text style={styles.rowTitle}>{row.symbol}</Text>
            <Text style={{ color: row.pnl >= 0 ? colors.up : colors.down, fontWeight: "700" }}>{formatInr(row.pnl)}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 32 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  user: { color: colors.muted, fontSize: 12, fontWeight: "600", marginTop: 6 },
  live: { color: colors.up, fontWeight: "700", fontSize: 12 },
  muted: { color: colors.muted, fontSize: 12, marginTop: 4, marginBottom: 6 },
  price: { fontSize: 18, fontWeight: "800" },
  deskRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, gap: 12 },
  tiny: { color: colors.muted, fontSize: 10, fontWeight: "700" },
  deskVal: { fontWeight: "800", fontSize: 13, marginTop: 2 },
  heading: { fontSize: 16, fontWeight: "800", marginVertical: 6 },
  metrics: { flexDirection: "row", gap: 8, marginTop: 10 },
  metric: { flex: 1, backgroundColor: colors.bg, borderRadius: 10, padding: 8 },
  metricVal: { color: colors.brand, fontWeight: "800", marginTop: 4 },
  cta: { marginTop: 12, height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  ctaText: { color: "#fff", fontWeight: "700" },
  barBg: { height: 8, backgroundColor: "#e5e7eb", borderRadius: 99, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.up },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowTitle: { fontWeight: "600" },
});
