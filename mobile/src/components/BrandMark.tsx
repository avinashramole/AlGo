import { StyleSheet, Text, View } from "react-native";

export function BrandMark({
  variant = "stacked",
  theme = "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#111827" : "#ffffff";

  if (variant === "emblem") {
    return <Letters size={36} />;
  }

  if (variant === "horizontal") {
    return (
      <View style={styles.row}>
        <Letters size={40} />
        <View>
          <Text style={styles.wordSm}>
            <Text style={{ color: trade }}>TRADE </Text>
            <Text style={styles.two}>2 </Text>
            <Text style={styles.s}>SMART</Text>
          </Text>
          <Text style={styles.tagSm}>INTELLIGENCE BEHIND EVERY TRADE.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.plate}>
      <Text style={styles.chart}>▲</Text>
      <Letters size={72} />
      <Text style={styles.word}>
        <Text style={styles.white}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <View style={styles.tagRow}>
        <Text style={styles.slashBlue}>{"//"}</Text>
        <Text style={styles.tag}>INTELLIGENCE BEHIND EVERY TRADE.</Text>
        <Text style={styles.slashGreen}>{"//"}</Text>
      </View>
    </View>
  );
}

function Letters({ size }: { size: number }) {
  return (
    <Text style={{ fontSize: size * 0.42, fontWeight: "800", fontStyle: "italic", letterSpacing: -2 }}>
      <Text style={{ color: "#2F7BFF" }}>T</Text>
      <Text style={{ color: "#E8EEF5" }}>2</Text>
      <Text style={{ color: "#22C55E" }}>S</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#05070c",
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 16,
    width: "100%",
    aspectRatio: 1,
    justifyContent: "center",
  },
  chart: { color: "#22C55E", fontSize: 22, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  two: { color: "#2F7BFF" },
  s: { color: "#22C55E" },
  white: { color: "#ffffff" },
  word: { marginTop: 10, fontSize: 18, fontWeight: "800", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", letterSpacing: 1.6 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  tag: { fontSize: 9, fontWeight: "600", letterSpacing: 1.1, color: "#ffffff" },
  tagSm: { fontSize: 8, marginTop: 2, fontWeight: "600", letterSpacing: 0.8, color: "#94a3b8" },
  slashBlue: { color: "#2F7BFF", fontWeight: "800", letterSpacing: -1 },
  slashGreen: { color: "#22C55E", fontWeight: "800", letterSpacing: -1 },
});
