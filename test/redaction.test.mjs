import test from "node:test";
import assert from "node:assert/strict";

import { containsUnredactedSensitiveValue, sanitizeAttributes } from "../src/observability/redaction.mjs";

test("the Resend re_ API key (the one secret this app holds) is redacted", () => {
  const key = ["re", "1234567890abcdef1234"].join("_");
  const sanitized = sanitizeAttributes({ note: `key is ${key}` });
  assert.doesNotMatch(JSON.stringify(sanitized), /re_1234567890/);
  assert.equal(containsUnredactedSensitiveValue(`leak ${key}`), true);
});

test("common non-prefixed secret formats are redacted", () => {
  // Fake keys are assembled at runtime so no literal in this file matches a real
  // provider key format (GitHub push protection scans source blobs).
  const secrets = {
    aws: ["AKIA", "IOSFODNN7EXAMPLE"].join(""),
    google: ["AIza", "SyA1234567890abcdefghijklmnopqrstuv"].join(""),
    slack: ["xoxb", "1234567890", "abcdefghijklmno"].join("-"),
    jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "abcDEF123456"].join(".")
  };
  const sanitized = JSON.stringify(sanitizeAttributes(secrets));
  assert.doesNotMatch(sanitized, /IOSFODNN7EXAMPLE/);
  assert.doesNotMatch(sanitized, /SyA1234567890/);
  assert.doesNotMatch(sanitized, /xoxb-1234567890/);
  assert.doesNotMatch(sanitized, /eyJzdWI/);
});

test("ordinary text is left intact (no over-redaction)", () => {
  const sanitized = sanitizeAttributes({ headline: "AI shopping agents expand for retail" });
  assert.equal(sanitized.headline, "AI shopping agents expand for retail");
});
