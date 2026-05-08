import { createHash } from "node:crypto";

export async function sendNewsletter({ mode, html, text, stories, config, date, fetchImpl = globalThis.fetch }) {
  const itemCount = stories.length;

  if (!config.sendEnabled) return skip("send_disabled");
  if (!["send", "auto"].includes(mode)) return skip("not_send_mode");
  if (!config.resendApiKey) return skip("missing_resend_api_key");
  if (!config.from) return skip("missing_from");
  if (!config.to.length || !config.to.every(isValidEmail)) return skip("missing_valid_recipients");
  if (itemCount < config.minItems) return skip("below_min_items");

  const payload = {
    from: config.from,
    to: config.to,
    subject: `NK AI Market Brief - ${date}`,
    html,
    text
  };
  if (config.cc.length) payload.cc = config.cc;
  if (config.replyTo) payload.reply_to = config.replyTo;

  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.resendApiKey}`,
      "content-type": "application/json",
      "Resend-Idempotency-Key": `nk-ai-market-brief:${date}:${hash(`${date}:${itemCount}:${text.slice(0, 100)}`)}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) return skip(`resend_http_${response.status}`);
  const data = await response.json();
  return { sent: true, messageId: data.id ?? "", skippedReason: "" };
}

function skip(skippedReason) {
  return { sent: false, messageId: "", skippedReason };
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
