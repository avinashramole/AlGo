import { StyleSheet, Text, View } from "react-native";

export function BrandMark({
  variant = "stacked",
  theme = variant === "stacked" ? "dark" : "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#6b7280" : "#9aa3b5";

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
      <Emblem size={112} />
      <Text style={styles.word}>
        <Text style={{ color: trade }}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <Text style={[styles.tag, { color: tag }]}>Intelligence Behind Every Trade.</Text>
    </View>
  );
}

function Emblem({ size }: { size: number }) {
  const step = Math.max(3, size * 0.035);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size * 0.24, borderWidth: Math.max(2, size * 0.03) }]}>
      <Text style={[styles.acronym, { fontSize: size * 0.32 }]}>
        <Text style={styles.t}>T</Text>
        <Text style={styles.two}>2</Text>
        <Text style={styles.s}>S</Text>
      </Text>
      <View style={[styles.steps, { height: size * 0.18, width: size * 0.62, marginTop: size * 0.04 }]}>
        <View style={[styles.step, { width: size * 0.18, height: step, alignSelf: "flex-end" }]} />
        <View style={[styles.riser, { width: step, height: size * 0.08 }]} />
        <View style={[styles.step, { width: size * 0.18, height: step }]} />
        <View style={[styles.riser, { width: step, height: size * 0.08 }]} />
        <View style={[styles.step, { width: size * 0.14, height: step }]} />
        <View style={[styles.dot, { width: size * 0.07, height: size * 0.07, borderRadius: size * 0.035 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    borderColor: "#2f7bff",
    backgroundColor: "#080b12",
    alignItems: "center",
    justifyContent: "center",
  },
  acronym: { fontWeight: "800", letterSpacing: -2, color: "#f4f7fb" },
  t: { color: "#2f7bff" },
  two: { color: "#e8eef5" },
  s: { color: "#b6ff3c" },
  steps: { flexDirection: "row", alignItems: "flex-end" },
  step: { backgroundColor: "#b6ff3c" },
  riser: { backgroundColor: "#b6ff3c" },
  dot: { backgroundColor: "#2f7bff", marginLeft: 2 },
  word: { marginTop: 12, fontSize: 20, fontWeight: "800", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", letterSpacing: 1.6 },
  tag: { marginTop: 6, fontSize: 12 },
  tagSm: { fontSize: 9, marginTop: 2 },
});
