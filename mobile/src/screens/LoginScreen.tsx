import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../AuthContext";
import { BrandMark } from "../components/BrandMark";
import type { SocialProvider } from "../api";
import { colors } from "../theme";

function looksLikeMobile(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits);
}

function channelOf(value: string): "gmail" | "mobile" {
  return looksLikeMobile(value) ? "mobile" : "gmail";
}

function socialHint(provider: SocialProvider) {
  if (provider === "microsoft") return "Enter your Microsoft email (Outlook / Hotmail / Live) first.";
  if (provider === "apple") return "Enter your Apple ID email (iCloud / me.com) first.";
  return "Enter your Gmail (you@gmail.com) first.";
}

export function LoginScreen() {
  const { login, requestOtp, verifyOtp, signup, resetPassword, loginThumb, hasThumb } = useAuth();
  const [page, setPage] = useState<"signin" | "signup" | "reset">("signin");
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [otp, setOtp] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [hint, setHint] = useState("");
  const [devOtp, setDevOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const channel = channelOf(identifier);

  const reset = () => {
    setSentTo("");
    setOtp("");
    setHint("");
    setDevOtp("");
    setPassword("");
    setConfirm("");
  };

  const fail = (title: string, error: unknown) => {
    Alert.alert(title, error instanceof Error ? error.message : "Try again");
  };

  const sendCode = async (purpose: "signup" | "login" | "reset", provider?: SocialProvider) => {
    if (!identifier.trim()) {
      Alert.alert("Email", provider ? socialHint(provider) : "Enter your Gmail or mobile first.");
      return false;
    }
    if (purpose === "signup" && name.trim().length < 2) {
      Alert.alert("Name", "Enter your name, then send the code.");
      return false;
    }
    setBusy(true);
    try {
      const result = await requestOtp({
        identifier,
        name,
        channel: provider ? "gmail" : channel,
        purpose,
        provider,
      });
      setSentTo(result.to || identifier);
      setHint(result.hint || "Enter the 6-digit code.");
      setDevOtp(result.devOtp || "");
      return true;
    } catch (error) {
      fail("Could not send code", error);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (page === "reset") {
      if (!sentTo) {
        const ok = await sendCode("reset");
        if (ok) setPage("reset");
        return;
      }
      if (password !== confirm) {
        Alert.alert("Password", "Passwords do not match.");
        return;
      }
      setBusy(true);
      try {
        await resetPassword({ identifier, otp, password });
      } catch (error) {
        fail("Could not reset password", error);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (page === "signup") {
      if (!sentTo) {
        await sendCode("signup");
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

    if (sentTo) {
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

    if (!password) {
      Alert.alert("Password", "Enter your password, or continue with Google / Microsoft / Apple.");
      return;
    }

    setBusy(true);
    try {
      await login(identifier || "demo@t2s.app", password);
    } catch (error) {
      fail("Sign in failed", error);
    } finally {
      setBusy(false);
    }
  };

  const onSocial = async (provider: SocialProvider) => {
    await sendCode(page === "signup" ? "signup" : "login", provider);
  };

  const onForgot = async () => {
    const ok = await sendCode("reset");
    if (ok) {
      setPage("reset");
      setPassword("");
      setConfirm("");
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

  const submitLabel =
    busy
      ? "Please wait..."
      : page === "signup"
        ? sentTo
          ? "Create account"
          : "Send code"
        : page === "reset"
          ? sentTo
            ? "Reset password"
            : "Send reset code"
          : sentTo
            ? "Verify & Login"
            : "Login";

  return (
    <KeyboardAvoidingView style={styles.wrap} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.brand}>
            <BrandMark variant="horizontal" theme="light" />
          </View>
          <Text style={styles.welcome}>
            {page === "signup" ? "Create account" : page === "reset" ? "Reset password" : "Welcome Back!"}
          </Text>
          <Text style={styles.sub}>
            {page === "signup"
              ? "Create your Trade 2 Smart account"
              : page === "reset"
                ? "Enter the code we sent, then choose a new password"
                : "Login to your Trade 2 Smart account"}
          </Text>
          {page === "signup" ? <Field label="Name" value={name} onChangeText={setName} placeholder="Your name" /> : null}
          <Field
            label="Gmail or mobile"
            value={identifier}
            onChangeText={(value) => {
              setIdentifier(value);
              setSentTo("");
              setOtp("");
            }}
            placeholder="Email or mobile"
            autoCapitalize="none"
          />
          {sentTo ? (
            <Field
              label="6-digit code"
              value={otp}
              onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              keyboardType="number-pad"
            />
          ) : null}
          {page === "signin" && !sentTo ? (
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="Password" secret />
          ) : null}
          {(page === "signup" || page === "reset") && sentTo ? (
            <>
              <Field
                label={page === "reset" ? "New password" : "Set password (min 6)"}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secret
              />
              <Field label="Confirm password" value={confirm} onChangeText={setConfirm} placeholder="Confirm password" secret />
            </>
          ) : null}

          {page === "signin" && !sentTo ? (
            <Pressable style={styles.ghost} onPress={() => void onForgot()} disabled={busy}>
              <Text style={styles.ghostText}>Forgot Password?</Text>
            </Pressable>
          ) : null}

          <Pressable style={styles.button} onPress={() => void submit()} disabled={busy}>
            <Text style={styles.buttonText}>{submitLabel}</Text>
          </Pressable>

          {page !== "reset" ? (
            <>
              <Text style={styles.or}>or continue with</Text>
              <View style={styles.social}>
                <Pressable style={styles.socialBtn} onPress={() => void onSocial("google")} disabled={busy}>
                  <Text style={styles.socialText}>Google</Text>
                </Pressable>
                <Pressable style={styles.socialBtn} onPress={() => void onSocial("microsoft")} disabled={busy}>
                  <Text style={styles.socialText}>Microsoft</Text>
                </Pressable>
                <Pressable style={styles.socialBtn} onPress={() => void onSocial("apple")} disabled={busy}>
                  <Text style={styles.socialText}>Apple</Text>
                </Pressable>
              </View>
            </>
          ) : null}

          {page === "signin" && hasThumb ? (
            <Pressable style={styles.ghost} onPress={() => void onThumb()} disabled={busy}>
              <Text style={styles.ghostText}>Use thumb</Text>
            </Pressable>
          ) : null}
        </View>

        <Pressable
          style={styles.switch}
          onPress={() => {
            setPage(page === "signin" ? "signup" : "signin");
            reset();
          }}
        >
          <Text style={styles.switchText}>
            {page === "signup" ? "Have an account? Sign in" : page === "reset" ? "Remembered it? Login" : "Don't have an account? Sign Up"}
          </Text>
        </Pressable>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        {devOtp ? <Text style={styles.dev}>Temporary code: {devOtp}</Text> : null}
        {page === "signin" ? <Text style={styles.hint}>Demo: demo@t2s.app / demo123</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secret,
  autoCapitalize,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secret?: boolean;
  autoCapitalize?: "none" | "sentences";
  keyboardType?: "number-pad" | "default";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secret}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  brand: { alignItems: "center", marginBottom: 18 },
  welcome: { color: colors.text, fontSize: 28, fontWeight: "800", marginBottom: 6 },
  sub: { color: colors.muted, fontSize: 14, marginBottom: 20 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 24,
    backgroundColor: colors.card,
  },
  field: { marginBottom: 12 },
  label: { color: colors.text, fontSize: 14, fontWeight: "600", marginBottom: 6 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.bg,
    color: colors.text,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: colors.brand,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  ghost: { height: 40, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.brand, fontWeight: "600" },
  or: { textAlign: "center", color: colors.muted, marginTop: 18, marginBottom: 10, fontSize: 13 },
  social: { flexDirection: "row", justifyContent: "center", gap: 8 },
  socialBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  socialText: { color: colors.text, fontSize: 12, fontWeight: "600" },
  switch: { marginTop: 8, height: 40, alignItems: "center", justifyContent: "center" },
  switchText: { color: colors.muted, fontSize: 14 },
  hint: { textAlign: "center", color: colors.muted, marginTop: 12, marginBottom: 8, fontSize: 12 },
  dev: { textAlign: "center", color: colors.up, marginTop: 8, fontSize: 13, fontWeight: "700" },
});
