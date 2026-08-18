import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../AuthContext";
import { Card } from "../components/Ui";
import { colors, formatMobile } from "../theme";

export function ProfileScreen() {
  const { user, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user]);

  const onSave = async () => {
    setBusy(true);
    try {
      await updateProfile({ name, email, mobile });
      Alert.alert("Profile", "Profile saved.");
    } catch (error) {
      Alert.alert("Profile", error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(user?.name || "T").slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user?.name || "Trader"}</Text>
      </View>
      <Card>
        <Row label="Name" value={user?.name || "—"} />
        <Row label="Email" value={user?.email || "Not added"} />
        <Row label="Mobile no" value={formatMobile(user?.mobile)} />
      </Card>
      <Text style={styles.edit}>Edit profile</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Name" />
      <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={setEmail} placeholder="Email" />
      <TextInput style={styles.input} keyboardType="phone-pad" value={mobile} onChangeText={setMobile} placeholder="Mobile no" />
      <Pressable style={styles.save} onPress={() => void onSave()} disabled={busy}>
        <Text style={styles.saveText}>{busy ? "Saving..." : "Save profile"}</Text>
      </Pressable>
      <Pressable style={styles.out} onPress={() => void logout()}>
        <Text style={styles.outText}>Log out</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16 },
  head: { alignItems: "center", marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  name: { fontSize: 22, fontWeight: "800" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  label: { color: colors.muted },
  value: { fontWeight: "700", maxWidth: "62%", textAlign: "right" },
  edit: { fontWeight: "800", marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  save: { height: 48, borderRadius: 12, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginTop: 4 },
  saveText: { color: "#fff", fontWeight: "700" },
  out: { height: 44, borderRadius: 12, backgroundColor: "#fef3f2", alignItems: "center", justifyContent: "center", marginTop: 12 },
  outText: { color: colors.down, fontWeight: "700" },
});
