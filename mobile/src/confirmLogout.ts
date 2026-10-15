import { Alert } from "react-native";

export function confirmLogout(onConfirm: () => void | Promise<void>) {
  Alert.alert("Log out?", "Are you sure you want to log out?", [
    { text: "Cancel", style: "cancel" },
    { text: "Log out", style: "destructive", onPress: () => void onConfirm() },
  ]);
}
