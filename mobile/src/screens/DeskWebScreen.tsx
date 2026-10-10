import Constants from "expo-constants";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../AuthContext";
import { getApiToken } from "../api";
import { deskOriginFromHost, deskStartPath, isDeskLoginUrl, sessionBootstrapScript } from "../deskUrl.js";
import { colors } from "../theme";

export function DeskWebScreen() {
  const { user, logout } = useAuth();
  const webRef = useRef<WebView>(null);
  const handedOff = useRef(false);
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);

  const origin = useMemo(
    () => deskOriginFromHost(Constants.expoConfig?.hostUri || "", process.env.EXPO_PUBLIC_WEB_URL || ""),
    [],
  );
  const startPath = deskStartPath(user?.role);
  const startUrl = `${origin}${startPath}`;
  const bootstrap = sessionBootstrapScript(token, user, startPath);

  useEffect(() => {
    void AsyncStorage.getItem("t2s-token").then((stored) => {
      setToken(getApiToken() || stored || "");
      setReady(true);
    });
  }, [user?.id]);

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.muted}>Opening {user?.role === "admin" ? "admin Algo" : "member desk"}…</Text>
      </View>
    );
  }

  return (
    <View style={styles.page}>
      <WebView
        ref={webRef}
        source={{ uri: startUrl }}
        originWhitelist={["*"]}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={bootstrap}
        injectedJavaScript={bootstrap}
        onLoadEnd={() => {
          webRef.current?.injectJavaScript(bootstrap);
        }}
        onNavigationStateChange={(nav) => {
          if (isDeskLoginUrl(nav.url)) {
            if (!handedOff.current) return;
            if (token) void logout();
            return;
          }
          handedOff.current = true;
        }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.boot}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.muted}>Loading Trade 2 Smart…</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  boot: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg, gap: 10 },
  muted: { color: colors.muted, fontSize: 13, fontWeight: "600" },
});
