import { StyleSheet, Text, View } from "react-native";

export function BrandMark() {
  return (
    <View style={styles.wrap}>
      <View style={styles.ring}>
        <View style={styles.candles}>
          <View style={[styles.candle, { height: 16 }]} />
          <View style={[styles.candle, { height: 22 }]} />
          <View style={[styles.candle, { height: 28 }]} />
          <View style={[styles.candle, { height: 36 }]} />
        </View>
        <Text style={styles.acronym}>
          <Text style={styles.t}>T</Text>
          <Text style={styles.two}>2</Text>
          <Text style={styles.s}>S</Text>
        </Text>
      </View>
      <Text style={styles.word}>
        <Text style={styles.trade}>TRADE </Text>
        <Text style={styles.two}>2 </Text>
        <Text style={styles.s}>SMART</Text>
      </Text>
      <View style={styles.tagRow}>
        <View style={styles.blueLine} />
        <Text style={styles.tag}>Intelligence Behind Every Trade.</Text>
        <View style={styles.greenLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", marginBottom: 20 },
  ring: {
    width: 168,
    height: 168,
    borderRadius: 84,
    borderWidth: 4,
    borderColor: "#2f7bff",
    borderRightColor: "#b6ff3c",
    borderTopColor: "#b6ff3c",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  candles: { position: "absolute", top: 10, flexDirection: "row", alignItems: "flex-end", gap: 4 },
  candle: { width: 7, backgroundColor: "#b6ff3c", borderRadius: 1 },
  acronym: { fontSize: 52, fontWeight: "800", letterSpacing: -2, marginTop: 12 },
  t: { color: "#2f7bff" },
  two: { color: "#e8eef5" },
  s: { color: "#b6ff3c" },
  word: { fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  trade: { color: "#f4f7fb" },
  tagRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  blueLine: { width: 28, height: 2, backgroundColor: "#2f7bff" },
  greenLine: { width: 28, height: 2, backgroundColor: "#b6ff3c" },
  tag: { color: "#f4f7fb", fontSize: 11 },
});
