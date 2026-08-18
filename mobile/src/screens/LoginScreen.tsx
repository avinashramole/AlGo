import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { connectGmail, getGmailStatus } from "../api";
import { useAuth } from "../AuthContext";
import { BrandMark } from "../components/BrandMark";

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
        <BrandMark />

        {showGmail ? (
          mailConnected ? (
            <Text style={styles.hint}>Gmail is connected. Login codes and a sign-in mail go to the inbox.</Text>
          ) : (
            <>
              <Text style={styles.hint}>Connect Gmail (App Password) so login codes and the after-login mail are emailed.</Text>
              <TextInput style={styles.input} autoCapitalize="none" value={senderEmail} onChangeText={setSenderEmail} placeholder="Desk Gmail (sends mail)" placeholderTextColor="#6b7385" />
              <TextInput style={styles.input} secureTextEntry value={appPassword} onChangeText={setAppPassword} placeholder="App Password" placeholderTextColor="#6b7385" />
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

        {page === "signup" ? <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" placeholderTextColor="#6b7385" /> : null}
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
          placeholderTextColor="#6b7385"
        />
        {sentTo ? (
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={otp}
            onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
            placeholderTextColor="#6b7385"
          />
        ) : null}
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder={page === "signup" ? "Set password (min 6)" : "Password"}
          placeholderTextColor="#6b7385"
        />
        {page === "signup" ? (
          <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" placeholderTextColor="#6b7385" />
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
  wrap: { flex: 1, backgroundColor: "#05070c" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  input: {
    backgroundColor: "#080b12",
    borderColor: "#243044",
    color: "#f4f7fb",
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#b6ff3c",
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#061006", fontWeight: "800" },
  ghost: { height: 40, alignItems: "center", justifyContent: "center" },
  ghostBtn: { height: 40, borderRadius: 12, borderWidth: 1, borderColor: "#2f7bff", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  ghostText: { color: "#6db3ff", fontWeight: "700" },
  switch: { marginTop: 8, height: 40, alignItems: "center", justifyContent: "center" },
  switchText: { color: "#8b93a7", fontWeight: "700", fontSize: 13 },
  hint: { textAlign: "center", color: "#8b93a7", marginTop: 12, marginBottom: 8, fontSize: 12 },
  dev: { textAlign: "center", color: "#b6ff3c", marginTop: 8, fontSize: 13, fontWeight: "700" },
});
