import { StyleSheet, Text, View } from "react-native";

/** stacked — login / splash; horizontal — home header; emblem — tab/icon */
export function BrandMark({
  variant = "stacked",
  theme = variant === "stacked" ? "dark" : "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#6b7280" : "#c5cddb";

  if (variant === "emblem") {
    return <Emblem size={40} />;
  }

  if (variant === "horizontal") {
    return (
      <View style={styles.row}>
        <Emblem size={40} />
        <View>
          <Text style={styles.wordSm}>
            <Text style={{ color: trade }}>TRADE </Text>
            <Text style={styles.two}>2 </Text>
            <Text style={styles.s}>SMART</Text>
          </Text>
          <Text style={[styles.tagSm, { color: tag }]}>Intelligence Behind Every Trade.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Emblem size={148} />
      <Text style={styles.word}>
        <Text style={{ color: trade }}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <View style={styles.tagRow}>
        <View style={styles.blueLine} />
        <Text style={[styles.tag, { color: tag }]}>Intelligence Behind Every Trade.</Text>
        <View style={styles.greenLine} />
      </View>
    </View>
  );
}

function Emblem({ size }: { size: number }) {
  return (
    <View
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(3, size * 0.035),
        },
      ]}
    >
      <View style={[styles.candles, { top: size * 0.12 }]}>
        <View style={[styles.candle, { height: size * 0.12, width: size * 0.045 }]} />
        <View style={[styles.candle, { height: size * 0.16, width: size * 0.045 }]} />
        <View style={[styles.candle, { height: size * 0.2, width: size * 0.045 }]} />
      </View>
      <Text style={[styles.acronym, { fontSize: size * 0.28, marginTop: size * 0.12 }]}>
        <Text style={styles.t}>T</Text>
        <Text style={styles.two}>2</Text>
        <Text style={styles.s}>S</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 20 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  ring: {
    borderColor: "#2f7bff",
    borderRightColor: "#b6ff3c",
    borderTopColor: "#b6ff3c",
    alignItems: "center",
    justifyContent: "center",
  },
  candles: { position: "absolute", flexDirection: "row", alignItems: "flex-end", gap: 4 },
  candle: { backgroundColor: "#b6ff3c", borderRadius: 1 },
  acronym: { fontWeight: "800", letterSpacing: -2 },
  t: { color: "#2f7bff" },
  two: { color: "#e8eef5" },
  s: { color: "#b6ff3c" },
  word: { marginTop: 14, fontSize: 22, fontWeight: "800", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", letterSpacing: 1.6 },
  blueLine: { width: 28, height: 2, backgroundColor: "#2f7bff" },
  greenLine: { width: 28, height: 2, backgroundColor: "#b6ff3c" },
  tagRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  tag: { fontSize: 12 },
  tagSm: { fontSize: 9, marginTop: 2 },
});
