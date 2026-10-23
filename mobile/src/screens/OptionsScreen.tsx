import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card } from "../components/Ui";
import { capStrikeWindow } from "../deskFeed";
import { colors, formatNumber, formatPct, hasDhanQuotes, vwapColor } from "../theme";

type ChainRow = {
  strike: number;
  atm?: boolean;
  callLtp: number;
  putLtp: number;
  callVwap?: number;
  putVwap?: number;
  callChg: number;
  putChg: number;
  callId?: number | string;
  putId?: number | string;
};

type Ticket = {
  option: "CE" | "PE";
  side: "BUY" | "SELL";
  row: ChainRow;
};

function optionTickPrice(value: unknown) {
  const n = Number(value);
  if (!(Number.isFinite(n) && n > 0)) return 0;
  return Math.round(n * 20) / 20;
}

function strikeLtp(row: ChainRow, option: "CE" | "PE") {
  return option === "CE" ? row.callLtp : row.putLtp;
}

export function OptionsScreen() {
  const { data, selectChain, order } = useMarket();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [ticketType, setTicketType] = useState<"MARKET" | "LIMIT">("LIMIT");
  const [ticketPrice, setTicketPrice] = useState("");
  const [ticketLots, setTicketLots] = useState(1);
  const meta = data.optionMeta;
  const underlyings = meta?.underlyings || [
    { id: "NIFTY", label: "NIFTY", lot: 65 },
    { id: "BANKNIFTY", label: "BANKNIFTY", lot: 30 },
    { id: "FINNIFTY", label: "FINNIFTY", lot: 60 },
    { id: "SENSEX", label: "SENSEX", lot: 20 },
    { id: "CRUDEOIL", label: "CRUDE OIL", lot: 100 },
  ];
  const lot = underlyings.find((item) => item.id === meta?.symbol)?.lot || 65;
  const futures = (data.futures || []).filter(
    (row) =>
      row.front && (!meta?.symbol || row.root === meta.symbol || row.symbol.startsWith(meta.symbol)),
  );
  const chainRows = capStrikeWindow(data.optionChain || []);
  const liveRow = ticket ? chainRows.find((row) => row.strike === ticket.row.strike) || ticket.row : null;
  const liveLtp = ticket && liveRow ? strikeLtp(liveRow, ticket.option) : 0;
  const placeLots = Math.max(1, ticketLots);
  const qty = placeLots * lot;

  const openTicket = (option: "CE" | "PE", side: "BUY" | "SELL", row: ChainRow) => {
    const tick = optionTickPrice(strikeLtp(row, option));
    setTicket({ option, side, row });
    setTicketType("LIMIT");
    setTicketPrice(tick > 0 ? String(tick) : "");
    setTicketLots(1);
  };

  const trade = async () => {
    if (!ticket) return;
    const { option, side } = ticket;
    const row = liveRow || ticket.row;
    const symbol = `${meta?.symbol || "NIFTY"} ${row.strike} ${option}`;
    const ltp = strikeLtp(row, option);
    const useLimit = ticketType === "LIMIT";
    const limit = optionTickPrice(ticketPrice) || optionTickPrice(ltp);
    if (useLimit && !(limit > 0)) {
      Alert.alert("Enter a Limit price", "Type a Limit price, or wait for LTP on this strike.");
      return;
    }
    try {
      const result = await order({
        symbol,
        side,
        qty,
        lots: placeLots,
        lotSize: lot,
        price: useLimit ? limit : ltp,
        product: "MIS",
        type: useLimit ? "LIMIT" : "MARKET",
        brokerId: data.dhanFeed?.live ? "dhan" : data.activeBrokerId,
        kind: "option",
        option,
        strike: row.strike,
        expiry: meta?.expiry,
        exchangeSegment: String(meta?.symbol || "").toUpperCase().includes("CRUDEOIL")
          ? "MCX_COMM"
          : String(meta?.symbol || "").toUpperCase().includes("SENSEX")
            ? "BSE_FNO"
            : "NSE_FNO",
        securityId: option === "CE" ? row.callId : row.putId,
      });
      const priceNote = useLimit ? `LIMIT @ ${limit}` : "MARKET";
      setTicket(null);
      if (result.live) {
        Alert.alert("Sent to Dhan", `${side} ${symbol} · ${placeLots} lot · ${priceNote}`);
      } else {
        Alert.alert("Desk fill only", result.warning || `${side} ${symbol} · ${placeLots} lot · ${priceNote}. Connect live Access Token on Brokers to send this to Dhan.`);
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
        brokerId: data.dhanFeed?.live ? "dhan" : data.activeBrokerId,
        expiry: row.expiry,
        exchangeSegment: row.segment,
        securityId: row.securityId,
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
        {meta?.pcr != null ? meta.pcr.toFixed(2) : "—"}
        {"\n"}
        {hasDhanQuotes(data) ? "Last Dhan quotes stay after NSE and MCX close. Orders go to Dhan when LIVE." : "Desk fill only until Access Token on Brokers"}
        {" · ATM ±5"}
        {String(meta?.symbol || "").toUpperCase().includes("CRUDEOIL") ? " · 1 lot = Dhan qty 1 (size 100)" : ` · 1 lot = ${lot}`}
        {"\n"}
        Tap BUY or SELL on a strike to set Market or Limit at that strike LTP.
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
      {chainRows.map((row) => (
        <Card key={row.strike}>
          <Text style={styles.strike}>
            {row.strike} {row.atm ? "ATM" : ""}
          </Text>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.muted}>CALL</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => openTicket("CE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Text style={[styles.vwap, { color: vwapColor(row.callVwap || row.callLtp, row.callLtp) }]}>
                  {formatNumber(row.callVwap || row.callLtp)}
                </Text>
                <Text style={styles.price}>{formatNumber(row.callLtp)}</Text>
                <Pressable style={styles.sell} onPress={() => openTicket("CE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
              <Text style={{ color: row.callChg >= 0 ? colors.up : colors.down }}>{formatPct(row.callChg)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={styles.muted}>PUT</Text>
              <View style={styles.actions}>
                <Pressable style={styles.buy} onPress={() => openTicket("PE", "BUY", row)}>
                  <Text style={styles.actionText}>BUY</Text>
                </Pressable>
                <Text style={[styles.vwap, { color: vwapColor(row.putVwap || row.putLtp, row.putLtp) }]}>
                  {formatNumber(row.putVwap || row.putLtp)}
                </Text>
                <Text style={styles.price}>{formatNumber(row.putLtp)}</Text>
                <Pressable style={styles.sell} onPress={() => openTicket("PE", "SELL", row)}>
                  <Text style={styles.actionText}>SELL</Text>
                </Pressable>
              </View>
              <Text style={{ color: row.putChg >= 0 ? colors.up : colors.down }}>{formatPct(row.putChg)}</Text>
            </View>
          </View>
        </Card>
      ))}
      </ScrollView>
      <Modal visible={Boolean(ticket)} transparent animationType="fade" onRequestClose={() => setTicket(null)}>
        <View style={styles.ticketScrim}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTicket(null)} />
          {ticket ? (
            <View style={styles.ticket}>
              <Text style={[styles.ticketTitle, { color: ticket.side === "BUY" ? colors.up : colors.down }]}>
                {ticket.side} {meta?.symbol || "NIFTY"} {ticket.row.strike} {ticket.option}
              </Text>
              <Text style={styles.muted}>
                LTP {formatNumber(liveLtp)}
                {ticket.row.atm ? " · ATM" : ""} · {ticketType === "LIMIT" ? "Limit at this strike" : "Market at this strike"}
              </Text>
              <View style={styles.chips}>
                {(["MARKET", "LIMIT"] as const).map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => {
                      setTicketType(type);
                      if (type === "LIMIT" && !optionTickPrice(ticketPrice)) {
                        const tick = optionTickPrice(liveLtp);
                        setTicketPrice(tick > 0 ? String(tick) : "");
                      }
                    }}
                    style={[styles.chip, ticketType === type && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, ticketType === type && styles.chipTextOn]}>
                      {type === "MARKET" ? "Market" : "Limit"}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {ticketType === "LIMIT" ? (
                <TextInput
                  value={ticketPrice}
                  onChangeText={setTicketPrice}
                  keyboardType="decimal-pad"
                  placeholder="Limit price"
                  placeholderTextColor={colors.muted}
                  style={styles.priceInput}
                />
              ) : null}
              <TextInput
                value={String(ticketLots)}
                onChangeText={(value) => setTicketLots(Math.max(1, Number(value) || 1))}
                keyboardType="number-pad"
                placeholder="Lots"
                placeholderTextColor={colors.muted}
                style={styles.priceInput}
              />
              <View style={styles.ticketActions}>
                <Pressable style={styles.cancel} onPress={() => setTicket(null)}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.place, ticket.side === "BUY" ? styles.buy : styles.sell]} onPress={() => void trade()}>
                  <Text style={styles.actionText}>Place {ticket.side}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
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
  priceInput: {
    minWidth: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.card,
    fontWeight: "700",
    fontSize: 12,
    color: colors.text || "#0f172a",
    marginBottom: 8,
  },
  strike: { fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  actions: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  price: { fontWeight: "800", fontSize: 16 },
  vwap: { fontWeight: "600", fontSize: 12, color: colors.muted },
  buy: { backgroundColor: colors.up, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sell: { backgroundColor: colors.down, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  actionText: { color: "#fff", fontWeight: "800", fontSize: 11 },
  ticketScrim: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(7, 24, 51, 0.48)",
    padding: 12,
  },
  ticket: {
    borderRadius: 16,
    backgroundColor: colors.card,
    padding: 16,
  },
  ticketTitle: { fontSize: 16, fontWeight: "800" },
  ticketActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  cancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelText: { fontWeight: "700" },
  place: { flex: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
});
