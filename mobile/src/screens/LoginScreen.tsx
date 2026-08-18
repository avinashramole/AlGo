import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { connectGmail, getGmailStatus } from "../api";
import { useAuth } from "../AuthContext";
import { colors } from "../theme";

export function LoginScreen() {
  const { login, requestOtp, verifyOtp } = useAuth();
  const [mode, setMode] = useState<"otp" | "password">("otp");
  const [name, setName] = useState("Segin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailConnected, setMailConnected] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");

  useEffect(() => {
    void getGmailStatus()
      .then((row) => setMailConnected(Boolean(row.connected)))
      .catch(() => undefined);
  }, []);

  const sendCode = async () => {
    setBusy(true);
    try {
      const result = await requestOtp(email, name);
      setSentTo(result.to || email);
      setHint(result.hint || "Check Gmail for the 6-digit code.");
      setDevOtp(result.devOtp || "");
    } catch (error) {
      Alert.alert("OTP failed", error instanceof Error ? error.message : "Could not send code");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "password") {
        await login(email || "demo@t2s.app", password);
        return;
      }
      if (!sentTo) {
        await sendCode();
        return;
      }
      await verifyOtp(email, otp);
    } catch (error) {
      Alert.alert("Login failed", error instanceof Error ? error.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.logo}>
        <Text style={styles.logoText}>T2</Text>
      </View>
      <Text style={styles.title}>Sign in</Text>
      <Text style={styles.sub}>T2S Algo Terminal · iOS + Android</Text>
      <View style={styles.tabs}>
        <Pressable style={[styles.tab, mode === "otp" && styles.tabOn]} onPress={() => setMode("otp")}>
          <Text style={[styles.tabText, mode === "otp" && styles.tabTextOn]}>Gmail OTP</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, mode === "password" && styles.tabOn]}
          onPress={() => {
            setMode("password");
            setEmail("demo@t2s.app");
            setPassword("demo123");
          }}
        >
          <Text style={[styles.tabText, mode === "password" && styles.tabTextOn]}>Sign in</Text>
        </Pressable>
      </View>
      {mode === "otp" ? (
        <>
          {!mailConnected ? (
            <>
              <Text style={styles.hint}>Connect Gmail (App Password) so OTP and the after-login mail are emailed.</Text>
              <TextInput style={styles.input} autoCapitalize="none" value={senderEmail} onChangeText={setSenderEmail} placeholder="Desk Gmail (sends mail)" />
              <TextInput style={styles.input} secureTextEntry value={appPassword} onChangeText={setAppPassword} placeholder="App Password" />
              <Pressable
                style={styles.ghostBtn}
                onPress={() => {
                  setBusy(true);
                  void connectGmail(senderEmail, appPassword)
                    .then((row) => {
                      setMailConnected(Boolean(row.connected));
                      setAppPassword("");
                      Alert.alert("Gmail connected", "Send the code next. It will arrive in Gmail.");
                    })
                    .catch((error) => Alert.alert("Gmail failed", error instanceof Error ? error.message : "Could not connect"))
                    .finally(() => setBusy(false));
                }}
                disabled={busy}
              >
                <Text style={styles.ghostText}>Connect Gmail</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.hint}>Gmail is connected. OTP and a login mail go to the inbox.</Text>
          )}
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name (Segin)" />
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setSentTo("");
              setDevOtp("");
            }}
            placeholder="you@gmail.com"
          />
          {sentTo ? (
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
              placeholder="6-digit code"
            />
          ) : null}
        </>
      ) : (
        <>
          <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Email" />
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
        </>
      )}
      <Pressable style={styles.button} onPress={() => void submit()} disabled={busy}>
        <Text style={styles.buttonText}>
          {busy ? "Please wait..." : mode === "password" ? "Sign in" : sentTo ? "Sign in" : "Send Gmail code"}
        </Text>
      </Pressable>
      {sentTo && mode === "otp" ? (
        <Pressable style={styles.ghost} onPress={() => void sendCode()} disabled={busy}>
          <Text style={styles.ghostText}>Resend code</Text>
        </Pressable>
      ) : null}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {devOtp ? <Text style={styles.dev}>No Gmail send yet. Temporary code: {devOtp}</Text> : null}
      <Text style={styles.hint}>
        {mode === "otp" ? "After login, T2S emails that Gmail a sign-in notice." : "Avinash demo: demo@t2s.app / demo123"}
      </Text>
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
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontWeight: "700", fontSize: 13 },
  tabTextOn: { color: "#fff" },
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
  ghost: { height: 40, alignItems: "center", justifyContent: "center" },
  ghostBtn: { height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  ghostText: { color: colors.brand, fontWeight: "700" },
  hint: { textAlign: "center", color: colors.muted, marginTop: 16, fontSize: 12 },
  dev: { textAlign: "center", color: "#b45309", marginTop: 8, fontSize: 13, fontWeight: "700" },
});
