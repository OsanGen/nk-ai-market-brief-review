import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

import { encryptHtml, gateHtml, normalizeCode } from "../scripts/protect-site.mjs";

const SECRET_HTML = "<!doctype html><html><body><h1>SecretHeadline about AgenticCommerce</h1><p>ConfidentialSummary paragraph.</p></body></html>";
const CODE = "DAR9-EF6L-LQYY";

function b64ToBytes(value) {
  return Uint8Array.from(Buffer.from(value, "base64"));
}

async function decrypt(payload, code) {
  const material = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(normalizeCode(code)), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBytes(payload.salt), iterations: payload.iter, hash: payload.hash },
    material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
  );
  const pt = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBytes(payload.iv) }, key, b64ToBytes(payload.ct));
  return new TextDecoder().decode(pt);
}

test("code normalization: dashes, spaces, and case all derive the same key", () => {
  assert.equal(normalizeCode("dar9-ef6l lqyy"), "DAR9EF6LLQYY");
  assert.equal(normalizeCode("DAR9EF6LLQYY"), "DAR9EF6LLQYY");
});

test("encrypt -> decrypt roundtrip recovers the exact brief", async () => {
  const payload = await encryptHtml(SECRET_HTML, CODE);
  assert.equal(payload.iter, 300000);
  assert.equal(await decrypt(payload, "dar9 ef6l lqyy"), SECRET_HTML);
});

test("a wrong code fails decryption outright (GCM auth)", async () => {
  const payload = await encryptHtml(SECRET_HTML, CODE);
  await assert.rejects(decrypt(payload, "WRONG-CODE-9999"));
});

test("the gate file contains zero plaintext from the brief and no passcode", async () => {
  const payload = await encryptHtml(SECRET_HTML, CODE);
  const gate = gateHtml(payload);
  assert.doesNotMatch(gate, /SecretHeadline|ConfidentialSummary|AgenticCommerce/);
  assert.doesNotMatch(gate, /DAR9|EF6L|LQYY/);
  assert.match(gate, /Content-Security-Policy/);
  assert.match(gate, /Private access\. Passcode required\./);
  assert.doesNotMatch(gate, /weekOverview|agent layer of commerce/i, "og strings are frozen, never live content");
});

test("short codes are refused at encryption time", async () => {
  await assert.rejects(encryptHtml(SECRET_HTML, "abc"), /at least 8/);
});
