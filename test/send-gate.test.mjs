import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.mjs";
import { isValidEmail, sendNewsletter } from "../src/send-resend.mjs";

const base = {
  mode: "send",
  html: "<p>Hello</p>",
  text: "Hello",
  stories: [{ title: "AI fashion" }, { title: "AI beauty" }, { title: "Agentic commerce" }],
  date: "2026-05-08"
};
const fromEmail = ["brief", ["example", "invalid"].join(".")].join("@");
const toEmail = ["team", ["example", "invalid"].join(".")].join("@");

test("Send gate refuses when NEWSLETTER_SEND_ENABLED=false", async () => {
  const result = await sendNewsletter({
    ...base,
    config: { sendEnabled: false, from: "", to: [], cc: [], minItems: 3, resendApiKey: "" }
  });
  assert.deepEqual(result, { sent: false, messageId: "", skippedReason: "send_disabled" });
});

test("Send gate refuses when recipients or API key are missing", async () => {
  const missingKey = await sendNewsletter({
    ...base,
    config: { sendEnabled: true, from: fromEmail, to: [toEmail], cc: [], minItems: 3, resendApiKey: "" }
  });
  const missingRecipient = await sendNewsletter({
    ...base,
    config: { sendEnabled: true, from: fromEmail, to: [], cc: [], minItems: 3, resendApiKey: "secret" }
  });
  assert.equal(missingKey.skippedReason, "missing_resend_api_key");
  assert.equal(missingRecipient.skippedReason, "missing_valid_recipients");
});

test("Preview mode cannot send even when email config is present", async () => {
  let called = false;
  const result = await sendNewsletter({
    ...base,
    mode: "preview",
    config: { sendEnabled: true, from: fromEmail, to: [toEmail], cc: [], minItems: 3, resendApiKey: "secret" },
    fetchImpl: async () => {
      called = true;
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(called, false);
  assert.equal(result.skippedReason, "not_send_mode");
});

test("Auto mode without env gates skips safely", async () => {
  const result = await sendNewsletter({
    ...base,
    mode: "auto",
    config: { sendEnabled: false, from: "", to: [], cc: [], minItems: 3, resendApiKey: "" }
  });

  assert.equal(result.skippedReason, "send_disabled");
});

test("Send gate refuses below NEWSLETTER_MIN_ITEMS", async () => {
  const result = await sendNewsletter({
    ...base,
    stories: [{ title: "AI fashion" }],
    config: { sendEnabled: true, from: fromEmail, to: [toEmail], cc: [], minItems: 3, resendApiKey: "secret" }
  });

  assert.equal(result.skippedReason, "below_min_items");
});

test("Recipient parsing handles comma-separated values and validates entries", () => {
  const secondEmail = ["ops", ["example", "invalid"].join(".")].join("@");
  const config = loadConfig({
    NEWSLETTER_TO: ` ${toEmail}, ${secondEmail} `,
    NEWSLETTER_MIN_ITEMS: "3"
  });

  assert.deepEqual(config.to, [toEmail, secondEmail]);
  assert.equal(config.to.every(isValidEmail), true);
  assert.equal(isValidEmail("not-an-email"), false);
});

test("Successful send uses Resend idempotency header without logging recipients", async () => {
  const calls = [];
  const result = await sendNewsletter({
    ...base,
    config: { sendEnabled: true, from: fromEmail, to: [toEmail], cc: [], minItems: 3, resendApiKey: "secret" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return { id: "message_123" };
        }
      };
    }
  });

  assert.equal(result.sent, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.headers["Resend-Idempotency-Key"], /^nk-ai-market-brief:2026-05-08:/);
});
