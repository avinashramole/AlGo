import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.t2s.algo",
  appName: "Trade 2 Smart",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1400,
      backgroundColor: "#071833",
      showSpinner: false,
    },
  },
};

export default config;
