import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ANDROID_APK_NAME = "Trade2Smart-web.apk";

export function androidApkPath(extraDirs = []) {
  const candidates = [
    ...extraDirs,
    path.join(root, "releases", ANDROID_APK_NAME),
    path.join(root, "dist", ANDROID_APK_NAME),
    path.join(root, "public", ANDROID_APK_NAME),
  ];
  return candidates.find((file) => file && fs.existsSync(file)) || "";
}

export function sendAndroidApk(req, res) {
  const file = androidApkPath();
  if (!file) {
    res.status(404).type("text").send("Android APK is not on this server yet.");
    return;
  }
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", `attachment; filename="${ANDROID_APK_NAME}"`);
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path.resolve(file));
}
