import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.t2s.algo",
  appName: "Trade 2 Smart",
  webDir: "dist",
  server: {
    androidScheme: "https",
    allowNavigation: ["trade2smart.com", "*.trade2smart.com"],
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
