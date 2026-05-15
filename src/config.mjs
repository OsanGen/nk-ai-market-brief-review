export function loadConfig(env = process.env, now = new Date(), options = {}) {
  const targetHourLocal = toInt(env.NEWSLETTER_TARGET_HOUR_LOCAL, 4);
  const maxItems = toInt(env.NEWSLETTER_MAX_ITEMS, 8);
  const minItems = toInt(env.NEWSLETTER_MIN_ITEMS, 3);
  const lookbackHours = toInt(env.NEWSLETTER_LOOKBACK_HOURS, 36);
  const mondayLookbackHours = toInt(env.NEWSLETTER_MONDAY_LOOKBACK_HOURS, 84);
  const reviewLookbackHours = toInt(env.NEWSLETTER_REVIEW_LOOKBACK_HOURS, 168);
  const minReviewItems = toInt(env.NEWSLETTER_MIN_REVIEW_ITEMS, 5);
  const normalLookbackHours = isMonday(now, env.NEWSLETTER_TIMEZONE || "America/New_York") ? mondayLookbackHours : lookbackHours;
  const reviewMode = options.reviewMode ?? options.mode === "preview";

  return {
    timezone: env.NEWSLETTER_TIMEZONE || "America/New_York",
    targetHourLocal,
    maxItems,
    minItems,
    lookbackHours,
    mondayLookbackHours,
    reviewLookbackHours,
    minReviewItems,
    activeLookbackHours: reviewMode ? reviewLookbackHours : normalLookbackHours,
    outputDir: env.NEWSLETTER_OUTPUT_DIR || ".newsletter-outbox",
    sendEnabled: env.NEWSLETTER_SEND_ENABLED === "true",
    from: env.NEWSLETTER_FROM || "",
    to: parseEmailList(env.NEWSLETTER_TO),
    cc: parseEmailList(env.NEWSLETTER_CC),
    replyTo: env.NEWSLETTER_REPLY_TO || "",
    resendApiKey: env.RESEND_API_KEY || ""
  };
}

export function outputDate(date = new Date(), timezone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function toInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseEmailList(value = "") {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isMonday(date, timezone) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
  return weekday === "Mon";
}
