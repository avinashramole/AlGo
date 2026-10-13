import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("user desk background is super white", () => {
  const css = fs.readFileSync(path.join(root, "src/index.css"), "utf8");
  const shell = fs.readFileSync(path.join(root, "src/components/layout/AppShell.tsx"), "utf8");
  const roles = fs.readFileSync(path.join(root, "src/lib/roles.ts"), "utf8");
  const boot = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(roles, /export const USER_DESK_CLASS = "t2s-user-desk"/);
  assert.match(roles, /export function isUserDesk/);
  assert.match(roles, /export function markUserDeskDocument/);
  assert.match(shell, /markUserDeskDocument\(user\)/);
  assert.match(shell, /data-user-desk=\{userDesk \? "true" : undefined\}/);
  assert.match(css, /:root \{[\s\S]*--bg: #ffffff;/);
  assert.match(css, /html:not\(\.dark\)[\s\S]*\.desk-header \{[\s\S]*background: #ffffff;/);
  assert.match(css, /html\.t2s-user-desk:not\(\.dark\) \{[\s\S]*--bg: #ffffff;/);
  assert.match(css, /html\.t2s-user-desk:not\(\.dark\)[\s\S]*\[data-user-desk\][\s\S]*background: #ffffff;/);
  assert.doesNotMatch(css, /--bg: #f4f6fb/);
  assert.doesNotMatch(boot, /#f4f6fb/);
  assert.match(boot, /background: #ffffff;/);
});
