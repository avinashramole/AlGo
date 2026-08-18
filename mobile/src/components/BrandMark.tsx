import { Image, StyleSheet, Text, View } from "react-native";

const emblem = require("../../assets/t2s-emblem.png");

export function BrandMark({
  variant = "stacked",
  theme = "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#1e293b" : "#e8eef5";
  const tag = theme === "light" ? "#334155" : "#f8fafc";

  if (variant === "emblem") {
    return <Image source={emblem} style={{ width: 40, height: 37 }} resizeMode="contain" />;
  }

  if (variant === "horizontal") {
    return (
      <View style={styles.row}>
        <Image source={emblem} style={{ width: 44, height: 41 }} resizeMode="contain" />
        <View>
          <Text style={styles.wordSm}>
            <Text style={{ color: trade }}>TRADE </Text>
            <Text style={styles.two}>2 </Text>
            <Text style={styles.s}>SMART</Text>
          </Text>
          <Text style={[styles.tagSm, { color: tag }]}>INTELLIGENCE BEHIND EVERY TRADE.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.plate}>
      <Image source={emblem} style={{ width: 148, height: 137 }} resizeMode="contain" />
      <Text style={styles.word}>
        <Text style={styles.silver}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <View style={styles.tagRow}>
        <Text style={styles.slashBlue}>{"//"}</Text>
        <Text style={styles.tag}>INTELLIGENCE BEHIND EVERY TRADE.</Text>
        <Text style={styles.slashGreen}>{"//"}</Text>
      </View>
      <View style={styles.bar} />
    </View>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: "#05070c",
    borderRadius: 24,
    paddingVertical: 20,
    paddingHorizontal: 16,
    width: "100%",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  two: { color: "#007BFF" },
  s: { color: "#32CD32" },
  silver: { color: "#E8EEF5" },
  word: { marginTop: 12, fontSize: 20, fontWeight: "800", fontStyle: "italic", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", fontStyle: "italic", letterSpacing: 1.6 },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  tag: { fontSize: 9, fontWeight: "600", letterSpacing: 1.1, color: "#ffffff" },
  tagSm: { fontSize: 8, marginTop: 2, fontWeight: "600", letterSpacing: 0.8 },
  slashBlue: { color: "#007BFF", fontWeight: "800", letterSpacing: -1 },
  slashGreen: { color: "#32CD32", fontWeight: "800", letterSpacing: -1 },
  bar: {
    marginTop: 8,
    height: 2,
    width: "88%",
    borderRadius: 2,
    backgroundColor: "#32CD32",
  },
});
