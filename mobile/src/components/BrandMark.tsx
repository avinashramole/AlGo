import { Image, StyleSheet, Text, View } from "react-native";

const emblem = require("../../assets/t2s-emblem.png");

export function BrandMark({
  variant = "stacked",
  theme = "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#111827" : "#f4f7fb";
  const tag = theme === "light" ? "#111827" : "#d1d5db";

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
          <Text style={[styles.tagSm, { color: tag }]}>
            INTELLIGENCE <Text style={styles.s}>BEHIND</Text> EVERY TRADE.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Image source={emblem} style={{ width: 148, height: 137 }} resizeMode="contain" />
      <Text style={styles.word}>
        <Text style={{ color: trade }}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <Text style={[styles.tag, { color: tag }]}>
        INTELLIGENCE <Text style={styles.s}>BEHIND</Text> EVERY TRADE.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  two: { color: "#2f7bff" },
  s: { color: "#22c55e" },
  word: { marginTop: 12, fontSize: 20, fontWeight: "800", fontStyle: "italic", letterSpacing: 3 },
  wordSm: { fontSize: 13, fontWeight: "800", fontStyle: "italic", letterSpacing: 1.6 },
  tag: { marginTop: 6, fontSize: 11, fontWeight: "600", letterSpacing: 1.2 },
  tagSm: { fontSize: 8, marginTop: 2, fontWeight: "600", letterSpacing: 0.8 },
});
