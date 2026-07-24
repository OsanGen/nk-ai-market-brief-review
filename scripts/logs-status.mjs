import { parseArgs } from "node:util";

import { queryCommandEvents, readLatestStatus } from "../src/observability/reader.mjs";
import { serializeError } from "../src/observability/redaction.mjs";

const { values } = parseArgs({
  options: {
    "log-root": { type: "string" }
  },
  strict: true
});

try {
  const result = await readLatestStatus(values["log-root"]);
  const commandEvents = await queryCommandEvents({
    logRoot: values["log-root"],
    run: result.manifest.runId
  });
  const evidence = commandEvidence(commandEvents);
  const health = { ...result.summary.health };
  if (evidence.liveStatus !== "not_observed") health.liveStatus = evidence.liveStatus;
  if (evidence.deploymentStatus !== "not_observed") health.deploymentStatus = evidence.deploymentStatus;
  const failed = result.manifest.status === "failed"
    || health.pipelineStatus === "failed"
    || evidence.commandStatus === "failed"
    || evidence.candidateStatus === "failed"
    || evidence.integrityStatus === "failed"
    || evidence.deploymentStatus === "failed"
    || evidence.liveStatus === "failed";
  const output = {
    ok: !failed,
    schemaVersion: result.manifest.schemaVersion,
    runId: result.manifest.runId,
    correlationId: result.manifest.correlationId,
    status: result.manifest.status,
    startedAt: result.manifest.startedAt,
    completedAt: result.manifest.completedAt,
    durationMs: result.manifest.durationMs,
    eventCount: result.manifest.eventCount,
    terminalEvent: result.manifest.terminalEvent,
    health,
    summary: result.summary.summary,
    commandEvidence: evidence,
    manifest: result.latest.manifest,
    events: result.latest.events
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
  if (failed) process.exitCode = 1;
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, ...serializeError(error) })}\n`);
  process.exitCode = 1;
}

function commandEvidence(events) {
  const latest = (eventNames) => [...events].reverse().find((event) => eventNames.includes(event.event));
  const command = latest(["command.newsletter.completed", "command.newsletter.failed"]);
  const candidate = latest(["deployment.candidate.verify.completed", "deployment.candidate.verify.failed"]);
  const verification = latest(["observability.verify.completed", "observability.verify.failed"]);
  const live = latest(["delivery.live.verify.completed", "delivery.live.verify.failed"]);
  const deploymentAttempt = String(live?.attributes?.deploymentStatus || "not_observed");
  const liveStatus = live ? (live.status === "fresh" ? "fresh" : "failed") : "not_observed";
  let deploymentStatus = "not_observed";
  if (deploymentAttempt === "attempted") deploymentStatus = liveStatus === "fresh" ? "verified" : "failed";
  else if (deploymentAttempt.startsWith("failed")) deploymentStatus = "failed";
  else if (deploymentAttempt.startsWith("skipped")) deploymentStatus = "skipped";
  return {
    eventCount: events.length,
    commandStatus: command?.status || "not_observed",
    candidateStatus: candidate?.status || "not_observed",
    integrityStatus: verification?.status || "not_observed",
    deploymentStatus,
    deploymentAttempt,
    liveStatus,
    liveReasonCode: live?.reasonCode || "",
    lastEvent: events.at(-1)?.event || "",
    lastEventAt: events.at(-1)?.timestamp || ""
  };
}
