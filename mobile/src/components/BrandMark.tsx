import { Image, StyleSheet } from "react-native";

const full = require("../../assets/t2s-logo.png");
const inner = require("../../assets/t2s-emblem.png");

export function BrandMark({
  variant = "stacked",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  if (variant === "emblem" || variant === "horizontal") {
    return <Image source={inner} style={styles.emblem} resizeMode="contain" />;
  }
  return <Image source={full} style={styles.lockup} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  lockup: { width: "100%", maxWidth: 220, height: 220, marginBottom: 12 },
  emblem: { width: 48, height: 48 },
});
