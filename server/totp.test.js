import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTotpSecret, totpCode } from "./totp.js";

test("normalizeTotpSecret strips spaces and reads otpauth URLs", () => {
  assert.equal(normalizeTotpSecret("jbsw y3dp ehpk 3pxp"), "JBSWY3DPEHPK3PXP");
  assert.equal(
    normalizeTotpSecret("otpauth://totp/Dhan?secret=JBSWY3DPEHPK3PXP&issuer=Dhan"),
    "JBSWY3DPEHPK3PXP",
  );
});

test("totpCode matches RFC 6238 SHA-1 6-digit vector", () => {
  assert.equal(totpCode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000), "287082");
});
