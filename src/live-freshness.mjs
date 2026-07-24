import { serializeError } from "./observability/redaction.mjs";

export const DEFAULT_LIVE_RUN_JSON_URL = "https://osangen.github.io/nk-ai-market-brief-review/run.json";
export const DEFAULT_MAX_ACTIVE_LOOKBACK_HOURS = 84;

export function localDateKey(date = new Date(), timezone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function localHour(date = new Date(), timezone = "America/New_York") {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  return Number(hour);
}

export function evaluateLiveFreshness(run, {
  now = new Date(),
  timezone = "America/New_York",
  maxActiveLookbackHours = DEFAULT_MAX_ACTIVE_LOOKBACK_HOURS,
  expectedRunId = ""
} = {}) {
  if (!run || typeof run !== "object") return stale("missing_run_json");

  const generatedAt = new Date(run.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) return stale("invalid_generated_at");
  if (localDateKey(generatedAt, timezone) !== localDateKey(now, timezone)) return stale("stale_generated_date");
  if (run.mode !== "auto") return stale("not_auto_mode");
  if (expectedRunId && run.runId !== expectedRunId) return stale("run_id_mismatch");

  if (run.health?.pipelineStatus === "failed") return stale("pipeline_failed");
  const sourceCount = Number(run.sourceCount);
  const sourceErrorCount = Number(run.sourceErrorCount);
  if (sourceCount > 0 && sourceErrorCount >= sourceCount) return stale("all_sources_failed");

  const activeLookbackHours = Number(run.config?.activeLookbackHours);
  if (!Number.isFinite(activeLookbackHours)) return stale("missing_active_lookback");
  if (activeLookbackHours > maxActiveLookbackHours) return stale("active_lookback_too_wide");
  if ((run.automationDefinitionConfigured ?? run.automationConfigured) !== true) return stale("automation_not_configured");
  if (run.send?.sent !== false) return stale("send_not_disabled");

  return { fresh: true, reason: "fresh" };
}

export async function getLiveFreshness({
  url = DEFAULT_LIVE_RUN_JSON_URL,
  now = new Date(),
  timezone = "America/New_York",
  maxActiveLookbackHours = DEFAULT_MAX_ACTIVE_LOOKBACK_HOURS,
  expectedRunId = "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000
} = {}) {
  try {
    const run = await fetchLiveRunJson({ url, now, fetchImpl, timeoutMs });
    return {
      reachable: true,
      run,
      ...evaluateLiveFreshness(run, { now, timezone, maxActiveLookbackHours, expectedRunId })
    };
  } catch (error) {
    const failure = serializeError(error);
    return {
      reachable: false,
      fresh: false,
      reason: "fetch_failed",
      errorCode: failure.errorCode,
      errorFingerprint: failure.errorFingerprint
    };
  }
}

export function shouldRunScheduledRefresh({
  freshness,
  now = new Date(),
  timezone = "America/New_York",
  targetHourLocal = 4
} = {}) {
  if (freshness?.fresh) return { shouldRun: false, reason: "live_already_fresh" };

  const hour = localHour(now, timezone);
  if (Number.isFinite(hour) && hour < Number(targetHourLocal)) {
    return { shouldRun: false, reason: "before_target_hour" };
  }

  return {
    shouldRun: true,
    reason: freshness?.reason || "live_stale"
  };
}

export async function waitForLiveFreshness({
  retries = 24,
  intervalMs = 10000,
  ...options
} = {}) {
  const startedAt = Date.now();
  let attemptCount = 1;
  let result = await getLiveFreshness(options);
  for (let attempt = 0; attempt < retries && !result.fresh; attempt += 1) {
    await sleep(intervalMs);
    result = await getLiveFreshness(options);
    attemptCount += 1;
  }
  return { ...result, attemptCount, durationMs: Date.now() - startedAt };
}

async function fetchLiveRunJson({ url, now, fetchImpl, timeoutMs }) {
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(cacheBustedUrl(url, now), {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function cacheBustedUrl(url, now) {
  const parsed = new URL(url);
  parsed.searchParams.set("v", `${now instanceof Date ? now.getTime() : Date.now()}`);
  return parsed.toString();
}

function stale(reason) {
  return { fresh: false, reason };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
