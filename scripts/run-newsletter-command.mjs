import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";

import { writeMachineRecord } from "../src/observability/machine-record.mjs";
import { serializeError } from "../src/observability/redaction.mjs";
import { runNewsletter } from "../src/run-newsletter.mjs";
import { shouldFailRun } from "../src/run-health.mjs";

export async function runNewsletterCommand({ mode, ensureSite = false, requireSend = false } = {}) {
  const runId = process.env.NEWSLETTER_RUN_ID || `newsletter-${randomUUID()}`;
  try {
    const result = await runNewsletter({ mode, force: true, observability: { runId } });
    if (ensureSite) await access("site/index.html");
    const failedPipeline = shouldFailRun(result);
    const sendFailed = requireSend && !result.send?.sent;
    const failed = failedPipeline || sendFailed;
    const degraded = result.health?.status === "degraded";
    writeMachineRecord({
      event: "command.newsletter.completed",
      level: failed ? "error" : degraded ? "warn" : "info",
      component: "command",
      phase: mode,
      status: failed ? "failed" : degraded ? "degraded" : "completed",
      reasonCode: failedPipeline
        ? result.health?.reasonCodes?.[0] || "pipeline_failed"
        : sendFailed
          ? result.send?.skippedReason || "send_failed"
          : result.health?.reasonCodes?.[0] || "",
      runId: result.runId,
      attributes: {
        outputDir: result.outputDir,
        mode: result.mode,
        activeLookbackHours: result.config?.activeLookbackHours,
        itemCount: result.itemCount,
        sourceCount: result.sourceCount,
        sourceErrorCount: result.sourceErrorCount,
        health: result.health,
        send: {
          sent: Boolean(result.send?.sent),
          skippedReason: result.send?.skippedReason || ""
        }
      }
    });
    if (failed) process.exitCode = 1;
    return result;
  } catch (error) {
    const failure = serializeError(error);
    writeMachineRecord({
      event: "command.newsletter.failed",
      level: "fatal",
      component: "command",
      phase: mode || "unknown",
      status: "failed",
      reasonCode: failure.errorCode,
      runId,
      attributes: { error: failure }
    });
    process.exitCode = 1;
    return null;
  }
}
