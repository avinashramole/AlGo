import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.t2s.algo",
  appName: "Trade 2 Smart",
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
};

export default config;
