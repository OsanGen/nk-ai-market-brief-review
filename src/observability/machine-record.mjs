import { randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import path from "node:path";

import { EVENT_SCHEMA_VERSION, EVENT_VERSION, LOG_LEVELS } from "./catalog.mjs";
import { resolvePrivateLogRoot } from "./log-path.mjs";
import { sanitizeAttributes, serializeError } from "./redaction.mjs";

const IDENTIFIER = /^[a-z][a-z0-9_.-]{1,127}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function createMachineRecord({
  event,
  level = "info",
  status = "completed",
  component = "command",
  phase = "",
  reasonCode = "",
  durationMs,
  runId = process.env.NEWSLETTER_RUN_ID || `standalone-${randomUUID()}`,
  attributes = {},
  now = new Date()
} = {}) {
  if (!event) throw new Error("machine record event is required");
  if (!IDENTIFIER.test(event)) throw new Error(`Invalid machine event: ${event}`);
  if (!IDENTIFIER.test(component)) throw new Error(`Invalid machine component: ${component}`);
  if (phase && !IDENTIFIER.test(phase)) throw new Error(`Invalid machine phase: ${phase}`);
  if (!IDENTIFIER.test(status)) throw new Error(`Invalid machine status: ${status}`);
  if (!RUN_ID.test(runId)) throw new Error("Machine record runId contains unsafe characters");
  const normalizedLevel = LOG_LEVELS.includes(level) ? level : "info";
  const workflowRunId = process.env.GITHUB_RUN_ID || "";
  const record = {
    schemaVersion: EVENT_SCHEMA_VERSION,
    eventVersion: EVENT_VERSION,
    timestamp: (now instanceof Date ? now : new Date(now)).toISOString(),
    eventId: `${runId}:standalone:${randomUUID()}`,
    runId,
    correlationId: workflowRunId || runId,
    sequence: 0,
    level: normalizedLevel,
    event,
    component,
    status
  };
  if (phase) record.phase = phase;
  if (reasonCode) record.reasonCode = safeReasonCode(reasonCode);
  if (Number.isFinite(durationMs)) record.durationMs = Math.max(0, Math.round(durationMs));
  addExecutionContext(record, process.env);
  const safeAttributes = sanitizeAttributes(attributes);
  if (safeAttributes && Object.keys(safeAttributes).length) record.attributes = safeAttributes;
  return record;
}

export function writeMachineRecord(input, {
  stream = process.stdout,
  errorStream = process.stderr,
  persist = true,
  logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs"
} = {}) {
  const record = createMachineRecord(input);
  const line = `${JSON.stringify(record)}\n`;
  if (persist) {
    try {
      const privateLogRoot = resolvePrivateLogRoot(logRoot);
      const commandPath = path.join(privateLogRoot, "commands.jsonl");
      mkdirSync(privateLogRoot, { recursive: true, mode: 0o700 });
      chmodSync(privateLogRoot, 0o700);
      appendFileSync(commandPath, line, { encoding: "utf8", mode: 0o600 });
      chmodSync(commandPath, 0o600);
    } catch (error) {
      const failure = serializeError(error);
      const persistenceFailure = createMachineRecord({
        event: "observability.persistence.failed",
        level: "fatal",
        component: "observability",
        phase: "command_persist",
        status: "failed",
        reasonCode: failure.errorCode,
        runId: record.runId,
        attributes: { error: failure }
      });
      errorStream?.write?.(`${JSON.stringify(persistenceFailure)}\n`);
      process.exitCode = 1;
    }
  }
  stream?.write?.(line);
  return record;
}

export function addExecutionContext(record, env = process.env) {
  const values = {
    environment: env.GITHUB_ACTIONS === "true" ? "github_actions" : "local",
    trigger: env.GITHUB_EVENT_NAME || "local",
    commitSha: env.GITHUB_SHA || "",
    workflowRunId: env.GITHUB_RUN_ID || "",
    workflowRunAttempt: env.GITHUB_RUN_ATTEMPT || ""
  };
  for (const [key, value] of Object.entries(values)) {
    if (value !== "") record[key] = value;
  }
}

function safeReasonCode(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 128) || "unknown";
}
