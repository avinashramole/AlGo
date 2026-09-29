import fs from "node:fs";
import path from "node:path";

/** Replace a file by rename so a restart cannot leave a truncated token file. */
export function writeFileAtomic(file, text, { mode = 0o600 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, file);
  try {
    fs.chmodSync(file, mode);
  } catch {
    /* windows */
  }
}
