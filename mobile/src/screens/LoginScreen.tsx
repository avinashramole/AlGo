import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../AuthContext";
import { colors } from "../theme";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("demo@t2s.app");
  const [password, setPassword] = useState("demo123");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await login(email, password);
    } catch (error) {
      Alert.alert("Login failed", error instanceof Error ? error.message : "Try demo@t2s.app / demo123");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>T2</Text>
      </View>
      <Text style={styles.title}>T2S Algo</Text>
      <Text style={styles.sub}>iOS + Android trading desk</Text>
      <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Email" />
      <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
      <Pressable style={styles.button} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? "Signing in..." : "Enter desk"}</Text>
      </Pressable>
      <Text style={styles.hint}>Demo login: demo@t2s.app / demo123</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 24 },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 18 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, marginBottom: 24, marginTop: 4 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: colors.brand,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
  hint: { textAlign: "center", color: colors.muted, marginTop: 16, fontSize: 12 },
});
