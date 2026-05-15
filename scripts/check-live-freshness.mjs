import {
  DEFAULT_LIVE_RUN_JSON_URL,
  waitForLiveFreshness
} from "../src/live-freshness.mjs";

const now = process.env.NEWSLETTER_NOW ? new Date(process.env.NEWSLETTER_NOW) : new Date();
const result = await waitForLiveFreshness({
  url: process.env.NEWSLETTER_LIVE_RUN_JSON_URL || DEFAULT_LIVE_RUN_JSON_URL,
  now,
  timezone: process.env.NEWSLETTER_TIMEZONE || "America/New_York",
  maxActiveLookbackHours: Number(process.env.NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS || 84),
  retries: Number(process.env.NEWSLETTER_LIVE_FRESHNESS_RETRIES || 24),
  intervalMs: Number(process.env.NEWSLETTER_LIVE_FRESHNESS_INTERVAL_MS || 10000)
});

console.log(JSON.stringify({
  fresh: result.fresh,
  reason: result.reason,
  reachable: result.reachable,
  generatedAt: result.run?.generatedAt,
  mode: result.run?.mode,
  activeLookbackHours: result.run?.config?.activeLookbackHours,
  automationConfigured: result.run?.automationConfigured,
  send: result.run?.send
}, null, 2));

if (!result.fresh) process.exitCode = 1;
