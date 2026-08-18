import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { connectGmail, getGmailStatus } from "../api";
import { useAuth } from "../AuthContext";
import { colors } from "../theme";

function looksLikeMobile(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
}

function looksLikeGmail(value: string) {
  return /@gmail\.com$|@googlemail\.com$/i.test(String(value || "").trim());
}

function channelOf(value: string): "gmail" | "mobile" {
  return looksLikeMobile(value) ? "mobile" : "gmail";
}

export function LoginScreen() {
  const { login, requestOtp, verifyOtp, signup, loginThumb, hasThumb } = useAuth();
  const [page, setPage] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [mailConnected, setMailConnected] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [appPassword, setAppPassword] = useState("");

  const channel = channelOf(identifier);
  const showGmail = looksLikeGmail(identifier);

  useEffect(() => {
    void getGmailStatus()
      .then((row) => setMailConnected(Boolean(row.connected)))
      .catch(() => undefined);
  }, []);

  const reset = () => {
    setSentTo("");
    setOtp("");
    setHint("");
    setDevOtp("");
  };

  const fail = (title: string, error: unknown) => {
    Alert.alert(title, error instanceof Error ? error.message : "Try again");
  };

  const sendCode = async () => {
    setBusy(true);
    try {
      const result = await requestOtp({
        identifier,
        name,
        channel,
        purpose: page === "signup" ? "signup" : "login",
      });
      setSentTo(result.to || identifier);
      setHint(result.hint || "Enter the 6-digit code.");
      setDevOtp(result.devOtp || "");
      if (result.gmail) setMailConnected(Boolean(result.gmail.connected));
    } catch (error) {
      fail("Could not send code", error);
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (page === "signup") {
      if (!sentTo) {
        await sendCode();
        return;
      }
      if (password !== confirm) {
        Alert.alert("Password", "Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        await signup({ name, identifier, otp, password, channel });
      } catch (error) {
        fail("Sign up failed", error);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (otp.length === 6) {
      setBusy(true);
      try {
        await verifyOtp(identifier, otp);
      } catch (error) {
        fail("Sign in failed", error);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (password) {
      setBusy(true);
      try {
        await login(identifier || "demo@t2s.app", password);
      } catch (error) {
        fail("Sign in failed", error);
      } finally {
        setBusy(false);
      }
      return;
    }

    await sendCode();
  };

  const onThumb = async () => {
    setBusy(true);
    try {
      await loginThumb();
    } catch (error) {
      fail("Thumb sign in failed", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>T2</Text>
        </View>
        <Text style={styles.title}>Trade 2 Smart</Text>

        {showGmail ? (
          mailConnected ? (
            <Text style={styles.hint}>Gmail is connected. Login codes and a sign-in mail go to the inbox.</Text>
          ) : (
            <>
              <Text style={styles.hint}>Connect Gmail (App Password) so login codes and the after-login mail are emailed.</Text>
              <TextInput style={styles.input} autoCapitalize="none" value={senderEmail} onChangeText={setSenderEmail} placeholder="Desk Gmail (sends mail)" />
              <TextInput style={styles.input} secureTextEntry value={appPassword} onChangeText={setAppPassword} placeholder="App Password" />
              <Pressable
                style={styles.ghostBtn}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void connectGmail(senderEmail, appPassword)
                    .then((row) => {
                      setMailConnected(Boolean(row.connected));
                      setAppPassword("");
                      Alert.alert("Gmail connected", "Send the code next.");
                    })
                    .catch((error) => fail("Gmail failed", error))
                    .finally(() => setBusy(false));
                }}
              >
                <Text style={styles.ghostText}>Connect Gmail</Text>
              </Pressable>
            </>
          )
        ) : null}

        {page === "signup" ? <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" /> : null}
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={identifier}
          onChangeText={(value) => {
            setIdentifier(value);
            setSentTo("");
            setOtp("");
          }}
          placeholder="Gmail or mobile"
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
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder={page === "signup" ? "Set password (min 6)" : "Password"}
        />
        {page === "signup" ? (
          <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" />
        ) : null}

        <Pressable style={styles.button} onPress={() => void submit()} disabled={busy}>
          <Text style={styles.buttonText}>
            {busy ? "Please wait..." : page === "signup" ? (sentTo ? "Create account" : "Send code") : "Sign in"}
          </Text>
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => void sendCode()} disabled={busy}>
          <Text style={styles.ghostText}>{sentTo ? "Resend code" : page === "signup" ? "Send code" : "Sign in with code"}</Text>
        </Pressable>
        {page === "signin" && hasThumb ? (
          <Pressable style={styles.ghost} onPress={() => void onThumb()} disabled={busy}>
            <Text style={styles.ghostText}>Use thumb</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={styles.switch}
          onPress={() => {
            setPage(page === "signup" ? "signin" : "signup");
            reset();
          }}
        >
          <Text style={styles.switchText}>{page === "signup" ? "Have an account? Sign in" : "New here? Create account"}</Text>
        </Pressable>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {devOtp ? <Text style={styles.dev}>Temporary code: {devOtp}</Text> : null}
        {page === "signin" ? <Text style={styles.hint}>Demo: demo@t2s.app / demo123</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
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
  title: { fontSize: 28, fontWeight: "800", color: colors.text, marginBottom: 24 },
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
  switch: { marginTop: 8, height: 40, alignItems: "center", justifyContent: "center" },
  switchText: { color: colors.muted, fontWeight: "700", fontSize: 13 },
  hint: { textAlign: "center", color: colors.muted, marginTop: 12, marginBottom: 8, fontSize: 12 },
  dev: { textAlign: "center", color: "#b45309", marginTop: 8, fontSize: 13, fontWeight: "700" },
});
