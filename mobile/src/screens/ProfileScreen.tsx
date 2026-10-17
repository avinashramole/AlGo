import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getMemberDesk } from "../api";
import { useAuth } from "../AuthContext";
import { confirmLogout } from "../confirmLogout";
import { Card } from "../components/Ui";
import { colors } from "../theme";

export function ProfileScreen() {
  const { user, updateProfile, logout } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [mobile, setMobile] = useState(user?.mobile || "");
  const [brokerName, setBrokerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (dirty) return;
    setName(user?.name || "");
    setEmail(user?.email || "");
    setMobile(user?.mobile || "");
  }, [user, dirty]);

  useEffect(() => {
    if (user?.role === "admin") return;
    let alive = true;
    void getMemberDesk()
      .then((desk) => {
        if (!alive) return;
        setBrokerName(desk.owner?.brokerName || desk.brokerId || "");
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [user?.role]);

  const onSave = async () => {
    setBusy(true);
    try {
      await updateProfile({ name, email, mobile });
      setDirty(false);
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
        <Text style={styles.name}>Profile</Text>
      </View>
      <Text style={styles.identity}>
        Name {name || "-"} | Email {email || "-"} | Mobile {mobile || "-"}
      </Text>
      <Text style={styles.edit}>Edit profile</Text>
      <TextInput style={styles.input} value={name} onChangeText={(value) => { setDirty(true); setName(value); }} placeholder="Name" />
      <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={(value) => { setDirty(true); setEmail(value); }} placeholder="Email" />
      <TextInput style={styles.input} keyboardType="phone-pad" value={mobile} onChangeText={(value) => { setDirty(true); setMobile(value); }} placeholder="Mobile no" />
      <Pressable style={styles.save} onPress={() => void onSave()} disabled={busy}>
        <Text style={styles.saveText}>{busy ? "Saving..." : "Save profile"}</Text>
      </Pressable>
      {user?.role !== "admin" ? (
        <Card>
          <Row label="Broker name" value={brokerName || "—"} />
        </Card>
      ) : null}
      <Pressable style={styles.out} onPress={() => confirmLogout(logout)}>
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
  identity: { fontSize: 18, fontWeight: "700", marginBottom: 8 },
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
