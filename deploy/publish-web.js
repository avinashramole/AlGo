import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const src = join(process.cwd(), "dist");
const dest = process.env.T2S_WEBROOT || "/var/www/trade2smart";

if (!existsSync(join(src, "index.html"))) {
  console.log("No dist/index.html to publish.");
  process.exit(0);
}
if (!existsSync(dest)) {
  console.log(`Website folder ${dest} is not on this machine. Skipping publish.`);
  process.exit(0);
}

const copy = spawnSync("cp", ["-af", `${src}/.`, `${dest}/`], { stdio: "inherit" });
if (copy.status !== 0) {
  console.log(`Could not copy the website to ${dest}. Run: cp -af dist/. ${dest}/`);
  process.exit(0);
}
spawnSync("chmod", ["-R", "a+rX", dest], { stdio: "inherit" });
spawnSync("chown", ["-R", "nginx:nginx", dest], { stdio: "ignore" });
console.log(`Published the website to ${dest}`);
