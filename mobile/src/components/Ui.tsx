import { type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Pill({ text, up }: { text: string; up?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: up ? "#ecfdf3" : "#fef3f2" }]}>
      <Text style={[styles.pillText, { color: up ? colors.up : colors.down }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  pill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  pillText: { fontSize: 11, fontWeight: "800" },
});
