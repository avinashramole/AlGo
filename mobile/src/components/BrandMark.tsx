import { Image, StyleSheet, Text, View } from "react-native";

const lockup = require("../../assets/t2s-lockup.png");
const emblem = require("../../assets/t2s-emblem.png");

export function BrandMark({
  variant = "stacked",
  theme = "light",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  const trade = theme === "light" ? "#6B7280" : "#E5E7EB";

  if (variant === "emblem") {
    return <Image source={emblem} style={styles.emblem} />;
  }

  if (variant === "horizontal") {
    return (
      <View style={styles.row}>
        <Image source={emblem} style={styles.emblem} />
        <Text style={styles.wordSm}>
          <Text style={{ color: trade }}>TRADE </Text>
          <Text style={styles.two}>2 </Text>
          <Text style={styles.s}>SMART</Text>
        </Text>
      </View>
    );
  }

  return <Image source={lockup} style={styles.lockup} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  lockup: { width: "100%", maxWidth: 260, height: 280, marginBottom: 12, backgroundColor: "transparent" },
  emblem: { width: 40, height: 40 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  two: { color: "#2F7BFF" },
  s: { color: "#22C55E" },
  wordSm: { fontSize: 13, fontWeight: "800", fontStyle: "italic", letterSpacing: 1.6 },
});
