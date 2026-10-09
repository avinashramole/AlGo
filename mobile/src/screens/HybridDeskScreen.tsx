import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView, type WebViewNavigation } from "react-native-webview";

export const DESK_URL = process.env.EXPO_PUBLIC_DESK_URL || "https://trade2smart.com";

function isDeskUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return (
      host === "trade2smart.com" ||
      host.endsWith(".trade2smart.com") ||
      host === "localhost" ||
      /^\d+\.\d+\.\d+\.\d+$/.test(host)
    );
  } catch {
    return false;
  }
}

export function HybridDeskScreen() {
  const webRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#071833" }} edges={["top"]}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: DESK_URL }}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        originWhitelist={["https://*", "http://*"]}
        onNavigationStateChange={(nav: WebViewNavigation) => setCanGoBack(nav.canGoBack)}
        onShouldStartLoadWithRequest={(request) => {
          if (isDeskUrl(request.url)) return true;
          Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        startInLoadingState
        renderLoading={() => (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#071833",
            }}
          >
            <ActivityIndicator color="#38bdf8" />
            <Text style={{ marginTop: 12, color: "#94a3b8" }}>Opening Trade 2 Smart…</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
