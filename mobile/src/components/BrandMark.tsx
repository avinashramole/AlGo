import { Image, StyleSheet } from "react-native";

const logo = require("../../assets/t2s-logo.png");

export function BrandMark({
  variant = "stacked",
}: {
  variant?: "stacked" | "horizontal" | "emblem";
  theme?: "dark" | "light";
}) {
  if (variant === "emblem" || variant === "horizontal") {
    return <Image source={logo} style={styles.emblem} resizeMode="contain" />;
  }
  return <Image source={logo} style={styles.lockup} resizeMode="contain" />;
}

const styles = StyleSheet.create({
  lockup: { width: "100%", maxWidth: 280, height: 280, marginBottom: 12 },
  emblem: { width: 40, height: 40 },
});
