import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useMarket } from "../MarketContext";
import { Card, Pill } from "../components/Ui";
import { colors, formatInr } from "../theme";

const SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX"];
const INDICATORS = ["VWAP", "RSI", "EMA", "MACD", "SUPERTREND"];
const PATTERNS = ["ORB", "BREAKOUT", "PINBAR", "ENGULFING", "SR_BOUNCE"];

type Draft = {
  id?: string;
  name: string;
  kind: "indicator" | "price-action";
  symbol: string;
  side: string;
  qty: string;
  timeframe: string;
  indicator: string;
  pattern: string;
  slPct: string;
  targetPct: string;
};

function blankDraft(): Draft {
  return {
    name: "",
    kind: "indicator",
    symbol: "NIFTY",
    side: "BUY",
    qty: "75",
    timeframe: "5m",
    indicator: "VWAP",
    pattern: "ORB",
    slPct: "0.4",
    targetPct: "0.8",
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
    await saveAlgo({
      ...draft,
      qty: Number(draft.qty),
      slPct: Number(draft.slPct),
      targetPct: Number(draft.targetPct),
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
    return (
      <ScrollView style={styles.page} contentContainerStyle={styles.content}>
        <Text style={styles.title}>{draft.id ? "Edit strategy" : "Add strategy"}</Text>
        <View style={styles.chips}>
          <Chip label="Indicator based" on={draft.kind === "indicator"} onPress={() => setDraft({ ...draft, kind: "indicator" })} />
          <Chip label="Price action based" on={draft.kind === "price-action"} onPress={() => setDraft({ ...draft, kind: "price-action" })} />
        </View>
        <Field label="Name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Text style={styles.muted}>Underlying</Text>
        <View style={styles.chips}>
          {SYMBOLS.map((symbol) => (
            <Chip key={symbol} label={symbol} on={draft.symbol === symbol} onPress={() => setDraft({ ...draft, symbol })} />
          ))}
        </View>
        {draft.kind === "indicator" ? (
          <>
            <Text style={styles.muted}>Indicator</Text>
            <View style={styles.chips}>
              {INDICATORS.map((indicator) => (
                <Chip key={indicator} label={indicator} on={draft.indicator === indicator} onPress={() => setDraft({ ...draft, indicator })} />
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.muted}>Price action</Text>
            <View style={styles.chips}>
              {PATTERNS.map((pattern) => (
                <Chip key={pattern} label={pattern} on={draft.pattern === pattern} onPress={() => setDraft({ ...draft, pattern })} />
              ))}
            </View>
          </>
        )}
        <Field label="Quantity" value={draft.qty} keyboard="numeric" onChange={(qty) => setDraft({ ...draft, qty })} />
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
            <Text style={styles.muted}>WR {algo.winRate}%</Text>
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
                  qty: String(algo.qty || 75),
                  timeframe: algo.timeframe || "5m",
                  indicator: algo.indicator || "VWAP",
                  pattern: algo.pattern || "ORB",
                  slPct: String(algo.slPct || 0.4),
                  targetPct: String(algo.targetPct || 0.8),
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
