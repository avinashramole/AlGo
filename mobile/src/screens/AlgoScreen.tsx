import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr } from "../theme";

const SYMBOLS: Array<{ id: string; lot: number }> = [
  { id: "NIFTY", lot: 65 },
  { id: "BANKNIFTY", lot: 30 },
  { id: "FINNIFTY", lot: 60 },
  { id: "SENSEX", lot: 20 },
];
const INDICATORS = ["VWAP", "RSI", "EMA", "MACD", "SUPERTREND"];
const PATTERNS = ["ORB", "BREAKOUT", "PINBAR", "ENGULFING", "SR_BOUNCE"];
const OPERATORS = [
  { id: "crosses_above", label: "Crosses above" },
  { id: "crosses_below", label: "Crosses below" },
  { id: "above", label: "Above" },
  { id: "below", label: "Below" },
  { id: "gt", label: ">" },
  { id: "lt", label: "<" },
  { id: "gte", label: ">=" },
  { id: "lte", label: "<=" },
  { id: "eq", label: "=" },
];
const LEFTS = ["price", "vwap", "ema_fast", "ema_slow", "rsi", "macd", "supertrend", "or_high", "or_low"];
const RIGHTS = ["vwap", "ema_slow", "supertrend", "or_high", "or_low", "lookback_high", "lookback_low", "value"];

type Draft = {
  id?: string;
  name: string;
  kind: "indicator" | "price-action";
  symbol: string;
  side: string;
  lots: string;
  timeframe: string;
  indicator: string;
  pattern: string;
  slPct: string;
  targetPct: string;
  buyLeft: string;
  buyOp: string;
  buyRight: string;
  buyValue: string;
  sellLeft: string;
  sellOp: string;
  sellRight: string;
  sellValue: string;
};

function lotFor(symbol: string) {
  return SYMBOLS.find((row) => row.id === symbol)?.lot || 65;
}

function defaultConditions(kind: Draft["kind"], indicator: string, pattern: string) {
  if (kind === "price-action") {
    if (pattern === "BREAKOUT") {
      return { buyLeft: "price", buyOp: "crosses_above", buyRight: "lookback_high", buyValue: "0", sellLeft: "price", sellOp: "crosses_below", sellRight: "lookback_low", sellValue: "0" };
    }
    if (pattern === "SR_BOUNCE") {
      return { buyLeft: "price", buyOp: "above", buyRight: "lookback_low", buyValue: "0", sellLeft: "price", sellOp: "below", sellRight: "lookback_high", sellValue: "0" };
    }
    return { buyLeft: "price", buyOp: "crosses_above", buyRight: "or_high", buyValue: "0", sellLeft: "price", sellOp: "crosses_below", sellRight: "or_low", sellValue: "0" };
  }
  if (indicator === "RSI") {
    return { buyLeft: "rsi", buyOp: "lt", buyRight: "value", buyValue: "30", sellLeft: "rsi", sellOp: "gt", sellRight: "value", sellValue: "70" };
  }
  if (indicator === "EMA") {
    return { buyLeft: "ema_fast", buyOp: "crosses_above", buyRight: "ema_slow", buyValue: "0", sellLeft: "ema_fast", sellOp: "crosses_below", sellRight: "ema_slow", sellValue: "0" };
  }
  if (indicator === "MACD") {
    return { buyLeft: "macd", buyOp: "crosses_above", buyRight: "value", buyValue: "0", sellLeft: "macd", sellOp: "crosses_below", sellRight: "value", sellValue: "0" };
  }
  if (indicator === "SUPERTREND") {
    return { buyLeft: "price", buyOp: "crosses_above", buyRight: "supertrend", buyValue: "0", sellLeft: "price", sellOp: "crosses_below", sellRight: "supertrend", sellValue: "0" };
  }
  return { buyLeft: "price", buyOp: "crosses_above", buyRight: "vwap", buyValue: "0", sellLeft: "price", sellOp: "crosses_below", sellRight: "vwap", sellValue: "0" };
}

function blankDraft(): Draft {
  return {
    name: "",
    kind: "indicator",
    symbol: "NIFTY",
    side: "BUY",
    lots: "1",
    timeframe: "5m",
    indicator: "VWAP",
    pattern: "ORB",
    slPct: "0.4",
    targetPct: "0.8",
    buyLeft: "price",
    buyOp: "crosses_above",
    buyRight: "vwap",
    buyValue: "0",
    sellLeft: "price",
    sellOp: "crosses_below",
    sellRight: "vwap",
    sellValue: "0",
  };
}

export function AlgoScreen() {
  const { data, toggle, saveAlgo, removeAlgo } = useMarket();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<"all" | "indicator" | "price-action">("all");

  const rows = data.algos.filter((algo) => {
    if (filter === "all") return true;
    return (algo.kind || "indicator") === filter;
  });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      Alert.alert("Name needed", "Give the strategy a name.");
      return;
    }
    const lots = Math.max(1, Number(draft.lots) || 1);
    const lotSize = lotFor(draft.symbol);
    await saveAlgo({
      ...draft,
      lots,
      lotSize,
      qty: lots * lotSize,
      slPct: Number(draft.slPct),
      targetPct: Number(draft.targetPct),
      buyValue: Number(draft.buyValue),
      sellValue: Number(draft.sellValue),
    });
    setDraft(null);
  };

  const remove = (id: string, name: string) => {
    Alert.alert("Delete strategy", `Delete ${name}?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void removeAlgo(id) },
    ]);
  };

  if (draft) {
    const lot = lotFor(draft.symbol);
    const lots = Math.max(1, Number(draft.lots) || 1);
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{draft.id ? "Edit strategy" : "Add strategy"}</Text>
        <View style={styles.chips}>
          <Chip label="Indicator based" on={draft.kind === "indicator"} onPress={() => setDraft({ ...draft, kind: "indicator", ...defaultConditions("indicator", draft.indicator, draft.pattern) })} />
          <Chip label="Price action based" on={draft.kind === "price-action"} onPress={() => setDraft({ ...draft, kind: "price-action", ...defaultConditions("price-action", draft.indicator, draft.pattern) })} />
        </View>
        <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Text style={styles.muted}>Underlying · 1 lot size</Text>
        <View style={styles.chips}>
          {SYMBOLS.map((symbol) => (
            <Chip
              key={symbol.id}
              label={`${symbol.id} ${symbol.lot}`}
              on={draft.symbol === symbol.id}
              onPress={() => setDraft({ ...draft, symbol: symbol.id })}
            />
          ))}
        </View>
        {draft.kind === "indicator" ? (
          <>
            <Text style={styles.muted}>Indicator</Text>
            <View style={styles.chips}>
              {INDICATORS.map((indicator) => (
                <Chip key={indicator} label={indicator} on={draft.indicator === indicator} onPress={() => setDraft({ ...draft, indicator, ...defaultConditions("indicator", indicator, draft.pattern) })} />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.muted}>Price action</Text>
            <View style={styles.chips}>
              {PATTERNS.map((pattern) => (
                <Chip key={pattern} label={pattern} on={draft.pattern === pattern} onPress={() => setDraft({ ...draft, pattern, ...defaultConditions("price-action", draft.indicator, pattern) })} />
              ))}
            </View>
          </>
        )}
        <Text style={styles.muted}>BUY when</Text>
        <View style={styles.chips}>
          {LEFTS.map((item) => (
            <Chip key={item} label={item} on={draft.buyLeft === item} onPress={() => setDraft({ ...draft, buyLeft: item })} />
          ))}
        </View>
        <View style={styles.chips}>
          {OPERATORS.map((item) => (
            <Chip key={item.id} label={item.label} on={draft.buyOp === item.id} onPress={() => setDraft({ ...draft, buyOp: item.id })} />
          ))}
        </View>
        <View style={styles.chips}>
          {RIGHTS.map((item) => (
            <Chip key={item} label={item} on={draft.buyRight === item} onPress={() => setDraft({ ...draft, buyRight: item })} />
          ))}
        </View>
        {draft.buyRight === "value" ? <Field label="Buy number" value={draft.buyValue} keyboard="numeric" onChange={(buyValue) => setDraft({ ...draft, buyValue })} /> : null}
        <Text style={styles.muted}>SELL when</Text>
        <View style={styles.chips}>
          {LEFTS.map((item) => (
            <Chip key={`sl-${item}`} label={item} on={draft.sellLeft === item} onPress={() => setDraft({ ...draft, sellLeft: item })} />
          ))}
        </View>
        <View style={styles.chips}>
          {OPERATORS.map((item) => (
            <Chip key={`s-${item.id}`} label={item.label} on={draft.sellOp === item.id} onPress={() => setDraft({ ...draft, sellOp: item.id })} />
          ))}
        </View>
        <View style={styles.chips}>
          {RIGHTS.map((item) => (
            <Chip key={`sr-${item}`} label={item} on={draft.sellRight === item} onPress={() => setDraft({ ...draft, sellRight: item })} />
          ))}
        </View>
        {draft.sellRight === "value" ? <Field label="Sell number" value={draft.sellValue} keyboard="numeric" onChange={(sellValue) => setDraft({ ...draft, sellValue })} /> : null}
        <Field label={`Lots (1 lot = ${lot} qty, order ${lots * lot})`} value={draft.lots} keyboard="numeric" onChange={(next) => setDraft({ ...draft, lots: next })} />
        <Field label="Stop loss %" value={draft.slPct} keyboard="numeric" onChange={(slPct) => setDraft({ ...draft, slPct })} />
        <Field label="Target %" value={draft.targetPct} keyboard="numeric" onChange={(targetPct) => setDraft({ ...draft, targetPct })} />
        <Pressable style={styles.cta} onPress={() => void save()}>
          <Text style={styles.ctaText}>{draft.id ? "Save changes" : "Add strategy"}</Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => setDraft(null)}>
          <Text style={styles.ghostText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Algo Desk</Text>
      <View style={styles.chips}>
        <Chip label="All" on={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Indicator" on={filter === "indicator"} onPress={() => setFilter("indicator")} />
        <Chip label="Price action" on={filter === "price-action"} onPress={() => setFilter("price-action")} />
      </View>
      {rows.map((algo) => (
        <Card key={algo.id}>
          <View style={styles.row}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.name}>{algo.name}</Text>
              <Text style={styles.muted}>{algo.summary || algo.tag}</Text>
            </View>
            <Pill text={algo.status} up={algo.status === "LIVE"} />
          </View>
          <View style={styles.stats}>
            <Text style={{ color: algo.pnl >= 0 ? colors.up : colors.down, fontWeight: "800" }}>{formatInr(algo.pnl)}</Text>
            <Text style={styles.muted}>
              {algo.lots || 1} lot × {algo.lotSize || lotFor(algo.symbol || "NIFTY")}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.muted}>{algo.enabled ? "Running" : "Paused"}</Text>
            <Switch value={algo.enabled} onValueChange={() => void toggle(algo.id)} />
          </View>
          <View style={styles.actions}>
            <Pressable
              style={styles.smallBtn}
              onPress={() =>
                setDraft({
                  id: algo.id,
                  name: algo.name,
                  kind: algo.kind === "price-action" ? "price-action" : "indicator",
                  symbol: algo.symbol || "NIFTY",
                  side: algo.side || "BUY",
                  lots: String(algo.lots || 1),
                  timeframe: algo.timeframe || "5m",
                  indicator: algo.indicator || "VWAP",
                  pattern: algo.pattern || "ORB",
                  slPct: String(algo.slPct || 0.4),
                  targetPct: String(algo.targetPct || 0.8),
                  buyLeft: algo.buyLeft || "price",
                  buyOp: algo.buyOp || "crosses_above",
                  buyRight: algo.buyRight || "vwap",
                  buyValue: String(algo.buyValue || 0),
                  sellLeft: algo.sellLeft || "price",
                  sellOp: algo.sellOp || "crosses_below",
                  sellRight: algo.sellRight || "vwap",
                  sellValue: String(algo.sellValue || 0),
                })
              }
            >
              <Text style={styles.smallBtnText}>Edit</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => remove(algo.id, algo.name)}>
              <Text style={[styles.smallBtnText, { color: colors.down }]}>Delete</Text>
            </Pressable>
          </View>
        </Card>
      ))}
      <Pressable style={styles.cta} onPress={() => setDraft(blankDraft())}>
        <Text style={styles.ctaText}>Add strategy</Text>
      </Pressable>
    </ScrollView>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboard?: "numeric";
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={styles.muted}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} keyboardType={keyboard} style={styles.input} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "800" },
  muted: { color: colors.muted, marginTop: 4, marginBottom: 6, fontSize: 12 },
  stats: { flexDirection: "row", justifyContent: "space-between", marginVertical: 12 },
  cta: { height: 44, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ctaText: { color: "#fff", fontWeight: "700" },
  ghost: { height: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
  ghostText: { fontWeight: "700", color: colors.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.card },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  input: { height: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, backgroundColor: colors.card, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  smallBtn: { flex: 1, height: 36, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  smallBtnText: { fontWeight: "700", fontSize: 12 },
});
