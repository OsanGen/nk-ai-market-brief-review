import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EVENT_SCHEMA_VERSION,
  EVENT_VERSION,
  LOG_LEVELS,
  TERMINAL_EVENTS,
  eventCatalogDocument
} from "./catalog.mjs";
import { addExecutionContext } from "./machine-record.mjs";
import { resolvePrivateLogRoot } from "./log-path.mjs";
import { sanitizeAttributes, serializeError } from "./redaction.mjs";

const storage = new AsyncLocalStorage();
const EVENT_NAME = /^[a-z][a-z0-9_.-]{1,127}$/;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export async function startTelemetryRun({
  mode = "unknown",
  logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs",
  runId = process.env.NEWSLETTER_RUN_ID || randomUUID(),
  env = process.env,
  stdout = process.stdout,
  now = () => new Date(),
  metadata = {},
  appendImpl = appendFile
} = {}) {
  if (!RUN_ID.test(runId)) throw new Error("NEWSLETTER_RUN_ID contains unsafe characters");
  const privateLogRoot = resolvePrivateLogRoot(logRoot);
  const started = toDate(now());
  const day = started.toISOString().slice(0, 10);
  const dayDirectory = path.join(privateLogRoot, day);
  const runDirectory = path.join(dayDirectory, runId);
  const eventsPath = path.join(runDirectory, "events.jsonl");
  const manifestPath = path.join(runDirectory, "run-manifest.json");
  const summaryPath = path.join(runDirectory, "summary.json");
  const catalogPath = path.join(privateLogRoot, "event-catalog.json");
  const latestPath = path.join(privateLogRoot, "LATEST.json");

  await mkdir(runDirectory, { recursive: true, mode: 0o700 });
  await Promise.all([
    chmod(privateLogRoot, 0o700),
    chmod(dayDirectory, 0o700),
    chmod(runDirectory, 0o700)
  ]);
  await writeFile(eventsPath, "", { encoding: "utf8", flag: "wx", mode: 0o600 });
  await writeJsonAtomic(catalogPath, eventCatalogDocument());

  let sequence = 0;
  let eventCount = 0;
  let terminalEvent = null;
  let finalized = false;
  let terminalWriteAuthorized = false;
  let writeQueue = Promise.resolve();
  const components = new Map();
  const safeMetadata = sanitizeAttributes(metadata);

  const telemetry = {
    runId,
    correlationId: env.GITHUB_RUN_ID || runId,
    mode,
    paths: {
      logRoot: privateLogRoot,
      runDirectory,
      eventsPath,
      manifestPath,
      summaryPath,
      latestPath,
      catalogPath
    },

    registerComponent(name, definition = {}) {
      validateIdentifier(name, "component");
      components.set(name, sanitizeAttributes(definition));
    },

    async event({
      event,
      level = "info",
      component = "newsletter",
      phase = "",
      status = "observed",
      reasonCode = "",
      durationMs,
      attributes = {}
    }) {
      if (finalized) throw new Error(`Cannot emit ${event} after terminal event`);
      validateEvent(event);
      if (TERMINAL_EVENTS.includes(event) && !terminalWriteAuthorized) {
        throw new Error(`Terminal event ${event} must be emitted through complete() or fail()`);
      }
      if (TERMINAL_EVENTS.includes(event) && terminalEvent) throw new Error("A terminal event already exists");
      validateIdentifier(component, "component");
      if (phase) validateIdentifier(phase, "phase");
      validateIdentifier(status, "status");
      const normalizedLevel = LOG_LEVELS.includes(level) ? level : "info";
      sequence += 1;
      components.set(component, components.get(component) ?? {});
      const record = {
        schemaVersion: EVENT_SCHEMA_VERSION,
        eventVersion: EVENT_VERSION,
        timestamp: toDate(now()).toISOString(),
        eventId: `${runId}:${String(sequence).padStart(6, "0")}`,
        runId,
        correlationId: telemetry.correlationId,
        sequence,
        level: normalizedLevel,
        event,
        component,
        status
      };
      if (phase) record.phase = phase;
      if (reasonCode) record.reasonCode = safeReasonCode(reasonCode);
      if (Number.isFinite(durationMs)) record.durationMs = Math.max(0, Math.round(durationMs));
      addExecutionContext(record, env);
      const safeAttributes = sanitizeAttributes(attributes);
      if (safeAttributes && Object.keys(safeAttributes).length) record.attributes = safeAttributes;
      const line = `${JSON.stringify(record)}\n`;
      // Chain appends to preserve order, but isolate failures: a rejected append
      // must not poison the queue. If it did, every later write — including the
      // terminal run.failed/run.completed event and finalize() — would be silently
      // skipped by promise-chain propagation, leaving a run with no terminal record
      // on disk exactly in the failure path where that record matters most.
      const write = writeQueue.then(() => appendImpl(eventsPath, line, "utf8"));
      writeQueue = write.catch(() => {});
      if (stdout?.write) stdout.write(line);
      await write;
      eventCount += 1;
      if (TERMINAL_EVENTS.includes(event)) terminalEvent = record;
      return record;
    },

    async phase({ name, component, attributes = {} }, callback) {
      validateEvent(name);
      const phaseStarted = Date.now();
      await telemetry.event({
        event: `${name}.started`,
        component,
        phase: name,
        status: "started",
        attributes
      });
      try {
        const result = await callback();
        await telemetry.event({
          event: `${name}.completed`,
          component,
          phase: name,
          status: "completed",
          durationMs: Date.now() - phaseStarted,
          attributes
        });
        return result;
      } catch (error) {
        const serialized = serializeError(error);
        await telemetry.event({
          event: `${name}.failed`,
          level: "error",
          component,
          phase: name,
          status: "failed",
          reasonCode: serialized.errorCode,
          durationMs: Date.now() - phaseStarted,
          attributes: { ...attributes, error: serialized }
        });
        throw error;
      }
    },

    operation(options, callback) {
      return telemetry.phase(options, callback);
    },

    reference() {
      return {
        schemaVersion: EVENT_SCHEMA_VERSION,
        runId,
        correlationId: telemetry.correlationId,
        manifest: portableRelative(privateLogRoot, manifestPath),
        summary: portableRelative(privateLogRoot, summaryPath),
        events: portableRelative(privateLogRoot, eventsPath)
      };
    },

    async complete({ status = "completed", reasonCode = "", health = {}, summary = {} } = {}) {
      if (finalized) return buildLatestReference({ status: terminalEvent?.status || status });
      const terminalName = status === "failed" ? "run.failed" : "run.completed";
      const level = status === "failed" ? "error" : status === "degraded" ? "warn" : "info";
      const completed = toDate(now());
      terminalWriteAuthorized = true;
      try {
        await telemetry.event({
          event: terminalName,
          level,
          component: "newsletter",
          phase: "run",
          status,
          reasonCode,
          durationMs: completed.getTime() - started.getTime(),
          attributes: { health, summary }
        });
      } finally {
        terminalWriteAuthorized = false;
      }
      finalized = true;
      await writeQueue;
      return finalize({ status, reasonCode, health, summary, completed });
    },

    async fail(error, { component = "newsletter", phase = "run", attributes = {} } = {}) {
      if (finalized) return buildLatestReference({ status: terminalEvent?.status || "failed" });
      const serialized = serializeError(error);
      const completed = toDate(now());
      terminalWriteAuthorized = true;
      try {
        await telemetry.event({
          event: "run.failed",
          level: "fatal",
          component,
          phase,
          status: "failed",
          reasonCode: serialized.errorCode,
          durationMs: completed.getTime() - started.getTime(),
          attributes: { ...attributes, error: serialized }
        });
      } finally {
        terminalWriteAuthorized = false;
      }
      finalized = true;
      await writeQueue;
      return finalize({
        status: "failed",
        reasonCode: serialized.errorCode,
        health: { status: "failed", pipelineStatus: "failed" },
        summary: { error: serialized },
        completed
      });
    }
  };

  telemetry.registerComponent("newsletter", { role: "run_orchestrator" });
  await telemetry.event({
    event: "run.started",
    component: "newsletter",
    phase: "run",
    status: "started",
    attributes: { mode, metadata: safeMetadata }
  });
  return telemetry;

  async function finalize({ status, reasonCode, health, summary, completed }) {
    const eventBytes = await readFile(eventsPath);
    const eventDigest = createHash("sha256").update(eventBytes).digest("hex");
    const safeSummary = sanitizeAttributes({
      schemaVersion: EVENT_SCHEMA_VERSION,
      runId,
      correlationId: telemetry.correlationId,
      status,
      reasonCode: reasonCode ? safeReasonCode(reasonCode) : "",
      health,
      summary
    });
    const manifest = {
      schemaVersion: EVENT_SCHEMA_VERSION,
      runId,
      correlationId: telemetry.correlationId,
      mode,
      status,
      reasonCode: reasonCode ? safeReasonCode(reasonCode) : "",
      startedAt: started.toISOString(),
      completedAt: completed.toISOString(),
      durationMs: Math.max(0, completed.getTime() - started.getTime()),
      eventCount,
      terminalEventId: terminalEvent?.eventId || "",
      terminalEvent: terminalEvent?.event || "",
      components: [...components.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, definition]) => ({ name, definition })),
      files: {
        events: portableRelative(privateLogRoot, eventsPath),
        summary: portableRelative(privateLogRoot, summaryPath)
      },
      integrity: {
        algorithm: "sha256",
        eventsDigest: eventDigest,
        eventsBytes: eventBytes.byteLength
      }
    };
    addExecutionContext(manifest, env);
    await writeJsonAtomic(summaryPath, safeSummary);
    await writeJsonAtomic(manifestPath, manifest);
    const latest = buildLatestReference({ status, completedAt: completed.toISOString() });
    await writeJsonAtomic(latestPath, latest);
    return latest;
  }

  function buildLatestReference({ status, completedAt = terminalEvent?.timestamp || "" }) {
    return {
      schemaVersion: EVENT_SCHEMA_VERSION,
      runId,
      correlationId: telemetry.correlationId,
      status,
      completedAt,
      manifest: portableRelative(privateLogRoot, manifestPath),
      summary: portableRelative(privateLogRoot, summaryPath),
      events: portableRelative(privateLogRoot, eventsPath)
    };
  }
}

export function withTelemetry(telemetry, callback) {
  return storage.run(telemetry, callback);
}

export function currentTelemetry() {
  return storage.getStore() ?? null;
}

export async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, filePath);
}

function validateEvent(event) {
  if (!EVENT_NAME.test(event)) throw new Error(`Invalid event name: ${event}`);
}

function validateIdentifier(value, label) {
  if (!EVENT_NAME.test(value)) throw new Error(`Invalid ${label}: ${value}`);
}

function safeReasonCode(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").slice(0, 128) || "unknown";
}

function portableRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Telemetry clock returned an invalid date");
  return date;
}
