import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getMemberDesk } from "../api";
import { useAuth } from "../AuthContext";
import { confirmLogout } from "../confirmLogout";
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
        {[name, email, mobile].map((value) => String(value || "").trim() || "-").join(" | ")}
      </Text>
      <Text style={styles.edit}>Edit profile</Text>
      <TextInput style={styles.input} value={name} onChangeText={(value) => { setDirty(true); setName(value); }} placeholder="Name" />
      <TextInput style={styles.input} autoCapitalize="none" value={email} onChangeText={(value) => { setDirty(true); setEmail(value); }} placeholder="Email" />
      <TextInput style={styles.input} keyboardType="phone-pad" value={mobile} onChangeText={(value) => { setDirty(true); setMobile(value); }} placeholder="Mobile no" />
      {user?.role !== "admin" ? (
        <View style={styles.broker}>
          <Text style={styles.brokerLabel}>Broker name</Text>
          <Text style={styles.brokerValue}>{brokerName || "—"}</Text>
        </View>
      ) : null}
      <View style={styles.saveRow}>
        <Pressable style={styles.save} onPress={() => void onSave()} disabled={busy}>
          <Text style={styles.saveText}>{busy ? "Saving..." : "Save profile"}</Text>
        </Pressable>
      </View>
      <Pressable style={styles.out} onPress={() => confirmLogout(logout)}>
        <Text style={styles.outText}>Log out</Text>
      </Pressable>
    </ScrollView>
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
  broker: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  brokerLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 },
  brokerValue: { fontWeight: "700", fontSize: 16 },
  saveRow: { alignItems: "flex-end" },
  save: { height: 44, minWidth: 156, borderRadius: 8, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, alignSelf: "stretch" },
  saveText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  out: { height: 44, borderRadius: 12, backgroundColor: "#fef3f2", alignItems: "center", justifyContent: "center", marginTop: 12 },
  outText: { color: colors.down, fontWeight: "700" },
});
