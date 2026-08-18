import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { connectGmail, getGmailStatus } from "../api";
import { useAuth } from "../AuthContext";
import { colors } from "../theme";

export function LoginScreen() {
  const { login, requestOtp, verifyOtp, signup, loginThumb, hasThumb } = useAuth();
  const [page, setPage] = useState<"signin" | "signup">("signin");
  const [method, setMethod] = useState<"password" | "otp" | "thumb">("password");
  const [channel, setChannel] = useState<"gmail" | "mobile">("gmail");
  const [name, setName] = useState("Segin");
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
      fail("OTP failed", error);
    } finally {
      setBusy(false);
    }
  };

  const onPassword = async () => {
    setBusy(true);
    try {
      await login(identifier || "demo@t2s.app", password);
    } catch (error) {
      fail("Sign in failed", error);
    } finally {
      setBusy(false);
    }
  };

  const onOtpSignIn = async () => {
    if (!sentTo) {
      await sendCode();
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(identifier, otp);
    } catch (error) {
      fail("Sign in failed", error);
    } finally {
      setBusy(false);
    }
  };

  const onSignup = async () => {
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

  const showGmail = channel === "gmail" && (page === "signup" || method === "otp");

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Text style={styles.logoText}>T2</Text>
        </View>
        <Text style={styles.title}>{page === "signup" ? "Sign up" : "Sign in"}</Text>
        <Text style={styles.sub}>T2S Algo Terminal · iOS + Android</Text>

        <View style={styles.tabs}>
          <Tab label="Sign in" on={page === "signin"} onPress={() => { setPage("signin"); reset(); }} />
          <Tab label="Sign up" on={page === "signup"} onPress={() => { setPage("signup"); setMethod("otp"); setChannel("gmail"); reset(); }} />
        </View>

        {page === "signin" ? (
          <View style={styles.tabs}>
            <Tab label="Password" on={method === "password"} onPress={() => { setMethod("password"); reset(); }} />
            <Tab label="OTP" on={method === "otp"} onPress={() => { setMethod("otp"); reset(); }} />
            <Tab label="Thumb" on={method === "thumb"} onPress={() => { setMethod("thumb"); reset(); }} />
          </View>
        ) : (
          <View style={styles.tabs}>
            <Tab label="Gmail OTP" on={channel === "gmail"} onPress={() => { setChannel("gmail"); reset(); }} />
            <Tab label="Mobile OTP" on={channel === "mobile"} onPress={() => { setChannel("mobile"); reset(); }} />
          </View>
        )}

        {showGmail ? (
          mailConnected ? (
            <Text style={styles.hint}>Gmail is connected. OTP and a login mail go to the inbox.</Text>
          ) : (
            <>
              <Text style={styles.hint}>Connect Gmail (App Password) so OTP and the after-login mail are emailed.</Text>
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

        {page === "signin" && method === "password" ? (
          <>
            <TextInput style={styles.input} autoCapitalize="none" value={identifier} onChangeText={setIdentifier} placeholder="Gmail or mobile" />
            <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Password" />
            <Pressable style={styles.button} onPress={() => void onPassword()} disabled={busy}>
              <Text style={styles.buttonText}>{busy ? "Please wait..." : "Sign in"}</Text>
            </Pressable>
            <Text style={styles.hint}>Demo: demo@t2s.app / demo123</Text>
          </>
        ) : null}

        {page === "signin" && method === "otp" ? (
          <>
            <View style={styles.tabs}>
              <Tab label="Gmail" on={channel === "gmail"} onPress={() => { setChannel("gmail"); reset(); }} />
              <Tab label="Mobile" on={channel === "mobile"} onPress={() => { setChannel("mobile"); reset(); }} />
            </View>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType={channel === "mobile" ? "phone-pad" : "email-address"}
              value={identifier}
              onChangeText={(value) => { setIdentifier(value); setSentTo(""); }}
              placeholder={channel === "mobile" ? "98xxxxxxxx" : "you@gmail.com"}
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
            <Pressable style={styles.button} onPress={() => void onOtpSignIn()} disabled={busy}>
              <Text style={styles.buttonText}>{busy ? "Please wait..." : sentTo ? "Sign in" : "Send OTP"}</Text>
            </Pressable>
            {sentTo ? (
              <Pressable style={styles.ghost} onPress={() => void sendCode()} disabled={busy}>
                <Text style={styles.ghostText}>Resend code</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        {page === "signin" && method === "thumb" ? (
          <>
            <Text style={styles.hint}>
              {hasThumb
                ? "Use fingerprint or Face ID on this phone."
                : "Sign in with password or OTP first, then enable Thumb in Settings."}
            </Text>
            <Pressable style={styles.button} onPress={() => void onThumb()} disabled={busy || !hasThumb}>
              <Text style={styles.buttonText}>{busy ? "Please wait..." : "Sign in with thumb"}</Text>
            </Pressable>
          </>
        ) : null}

        {page === "signup" ? (
          <>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name (Segin)" />
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType={channel === "mobile" ? "phone-pad" : "email-address"}
              value={identifier}
              onChangeText={(value) => { setIdentifier(value); setSentTo(""); }}
              placeholder={channel === "mobile" ? "98xxxxxxxx" : "you@gmail.com"}
            />
            {sentTo ? (
              <>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                />
                <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} placeholder="Set password (min 6)" />
                <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} placeholder="Confirm password" />
              </>
            ) : null}
            <Pressable style={styles.button} onPress={() => void onSignup()} disabled={busy}>
              <Text style={styles.buttonText}>{busy ? "Please wait..." : sentTo ? "Create account" : "Send OTP"}</Text>
            </Pressable>
            {sentTo ? (
              <Pressable style={styles.ghost} onPress={() => void sendCode()} disabled={busy}>
                <Text style={styles.ghostText}>Resend code</Text>
              </Pressable>
            ) : null}
            <Text style={styles.hint}>Verify Gmail or mobile, set a password, then sign in with password, mobile, thumb, or OTP.</Text>
          </>
        ) : null}

        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {devOtp ? <Text style={styles.dev}>Temporary code: {devOtp}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Tab({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.tab, on && styles.tabOn]} onPress={onPress}>
      <Text style={[styles.tabText, on && styles.tabTextOn]}>{label}</Text>
    </Pressable>
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
  title: { fontSize: 28, fontWeight: "800", color: colors.text },
  sub: { color: colors.muted, marginBottom: 24, marginTop: 4 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: { flex: 1, height: 40, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontWeight: "700", fontSize: 12 },
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
  hint: { textAlign: "center", color: colors.muted, marginTop: 12, marginBottom: 8, fontSize: 12 },
  dev: { textAlign: "center", color: "#b45309", marginTop: 8, fontSize: 13, fontWeight: "700" },
});
