import { StyleSheet, Text, View } from "react-native";

export function BrandMark({
  variant = "stacked",
  theme = "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#111827" : "#f4f7fb";

  if (variant === "emblem") {
    return <Letters size={40} />;
  }

  if (variant === "horizontal") {
    return (
      <View style={styles.row}>
        <Letters size={40} />
        <Text style={styles.wordSm}>
          <Text style={{ color: trade }}>TRADE </Text>
          <Text style={styles.two}>2 </Text>
          <Text style={styles.s}>SMART</Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.plate}>
      <Letters size={88} />
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
    <Text style={{ fontSize: size * 0.5, fontWeight: "800", fontStyle: "italic", letterSpacing: -3 }}>
      <Text style={{ color: "#2F7BFF" }}>T</Text>
      <Text style={{ color: "#E8EEF5" }}>2</Text>
      <Text style={{ color: "#22C55E" }}>S</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    backgroundColor: "#05070c",
    borderRadius: 32,
    paddingVertical: 24,
    paddingHorizontal: 16,
    width: "100%",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  two: { color: "#2F7BFF" },
  s: { color: "#22C55E" },
  white: { color: "#F4F7FB" },
  word: { marginTop: 8, fontSize: 18, fontWeight: "800", fontStyle: "italic", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", letterSpacing: 1.6 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  tag: { fontSize: 9, fontWeight: "600", letterSpacing: 1.1, color: "#ffffff" },
  slashBlue: { color: "#2F7BFF", fontWeight: "800", letterSpacing: -1 },
  slashGreen: { color: "#22C55E", fontWeight: "800", letterSpacing: -1 },
});
