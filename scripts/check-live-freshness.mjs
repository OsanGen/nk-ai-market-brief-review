import {
  DEFAULT_LIVE_RUN_JSON_URL,
  waitForLiveFreshness
} from "../src/live-freshness.mjs";
import { writeMachineRecord } from "../src/observability/machine-record.mjs";

const now = process.env.NEWSLETTER_NOW ? new Date(process.env.NEWSLETTER_NOW) : new Date();
const expectedRunId = process.env.NEWSLETTER_EXPECT_LIVE_RUN_ID || process.env.NEWSLETTER_RUN_ID || "";
const result = await waitForLiveFreshness({
  url: process.env.NEWSLETTER_LIVE_RUN_JSON_URL || DEFAULT_LIVE_RUN_JSON_URL,
  now,
  timezone: process.env.NEWSLETTER_TIMEZONE || "America/New_York",
  maxActiveLookbackHours: Number(process.env.NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS || 84),
  expectedRunId,
  retries: Number(process.env.NEWSLETTER_LIVE_FRESHNESS_RETRIES || 24),
  intervalMs: Number(process.env.NEWSLETTER_LIVE_FRESHNESS_INTERVAL_MS || 10000)
});

writeMachineRecord({
  event: result.fresh ? "delivery.live.verify.completed" : "delivery.live.verify.failed",
  level: result.fresh ? "info" : "error",
  component: "live_verification",
  phase: "live_verify",
  status: result.fresh ? "fresh" : "failed",
  reasonCode: result.reason,
  durationMs: result.durationMs,
  runId: process.env.NEWSLETTER_RUN_ID || result.run?.runId,
  attributes: {
    fresh: result.fresh,
    reason: result.reason,
    reachable: result.reachable,
    attemptCount: result.attemptCount,
    generatedAt: result.run?.generatedAt,
    liveRunId: result.run?.runId,
    expectedRunId,
    deploymentStatus: process.env.NEWSLETTER_DEPLOYMENT_STATUS || "unknown",
    mode: result.run?.mode,
    activeLookbackHours: result.run?.config?.activeLookbackHours,
    pipelineStatus: result.run?.health?.pipelineStatus,
    sourceCount: result.run?.sourceCount,
    sourceErrorCount: result.run?.sourceErrorCount,
    automationDefinitionConfigured: result.run?.automationDefinitionConfigured ?? result.run?.automationConfigured,
    sendSent: result.run?.send?.sent,
    errorCode: result.errorCode,
    errorFingerprint: result.errorFingerprint
  }
});

if (!result.fresh) process.exitCode = 1;
