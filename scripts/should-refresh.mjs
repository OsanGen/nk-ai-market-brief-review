import { randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";

import {
  DEFAULT_LIVE_RUN_JSON_URL,
  getLiveFreshness,
  shouldRunScheduledRefresh
} from "../src/live-freshness.mjs";
import { writeMachineRecord } from "../src/observability/machine-record.mjs";
import { serializeError } from "../src/observability/redaction.mjs";

const runId = process.env.NEWSLETTER_RUN_ID || `refresh-${randomUUID()}`;

try {
  await main();
} catch (error) {
  const failure = serializeError(error);
  writeMachineRecord({
    event: "refresh.decision.failed",
    level: "fatal",
    component: "refresh_gate",
    phase: "refresh_decision",
    status: "failed",
    reasonCode: failure.errorCode,
    runId,
    attributes: { error: failure }
  });
  process.exitCode = 1;
}

async function main() {
  const now = process.env.NEWSLETTER_NOW ? new Date(process.env.NEWSLETTER_NOW) : new Date();
  const mode = process.env.RUN_MODE || "auto";
  const eventName = process.env.GITHUB_EVENT_NAME || "";
  const timezone = process.env.NEWSLETTER_TIMEZONE || "America/New_York";
  const targetHourLocal = Number(process.env.NEWSLETTER_TARGET_HOUR_LOCAL || 4);
  const url = process.env.NEWSLETTER_LIVE_RUN_JSON_URL || DEFAULT_LIVE_RUN_JSON_URL;

  let decision;
  if (mode !== "auto" || eventName !== "schedule") {
    decision = { shouldRun: true, reason: "manual_or_non_auto" };
  } else {
    const freshness = await getLiveFreshness({ url, now, timezone });
    decision = shouldRunScheduledRefresh({ freshness, now, timezone, targetHourLocal });
    decision.freshness = { fresh: freshness.fresh, reachable: freshness.reachable, reason: freshness.reason };
  }

  const record = writeMachineRecord({
    event: "refresh.decision",
    level: decision.shouldRun && decision.freshness?.reachable === false ? "warn" : "info",
    component: "refresh_gate",
    phase: "refresh_decision",
    status: decision.shouldRun ? "run" : "skip",
    reasonCode: decision.reason,
    attributes: {
      decision,
      now: now.toISOString(),
      mode,
      eventName,
      timezone,
      targetHourLocal
    },
    runId,
    now
  });

  try {
    await writeGithubOutput({
      should_run: String(decision.shouldRun),
      reason: decision.reason,
      run_id: record.runId
    });
  } catch (error) {
    const failure = serializeError(error);
    writeMachineRecord({
      event: "refresh.output.failed",
      level: "fatal",
      component: "refresh_gate",
      phase: "github_output",
      status: "failed",
      reasonCode: failure.errorCode,
      runId,
      attributes: { error: failure }
    });
    process.exitCode = 1;
  }
}

async function writeGithubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n");
  await appendFile(process.env.GITHUB_OUTPUT, `${lines}\n`, "utf8");
}
