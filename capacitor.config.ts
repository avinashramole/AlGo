import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.t2s.algo",
  appName: "Trade 2 Smart",
  webDir: "dist",
  server: {
    url: "https://trade2smart.com",
    androidScheme: "https",
    allowNavigation: [
      "trade2smart.com",
      "*.trade2smart.com",
      "accounts.google.com",
      "*.google.com",
      "*.googleapis.com",
      "*.gstatic.com",
      "*.googleusercontent.com",
    ],
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
