import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import {
  EVENT_SCHEMA_VERSION,
  EVENT_VERSION,
  LOG_LEVELS,
  REQUIRED_EVENT_FIELDS,
  TERMINAL_EVENTS
} from "./catalog.mjs";
import { containsUnredactedSensitiveValue } from "./redaction.mjs";

export async function readLatestStatus(logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs") {
  const latest = await readJson(path.join(logRoot, "LATEST.json"));
  const manifest = await readJson(resolveContained(logRoot, latest.manifest, "manifest"));
  const summary = await readJson(resolveContained(logRoot, latest.summary, "summary"));
  if (latest.runId !== manifest.runId || summary.runId !== manifest.runId) {
    throw new Error("Latest observability pointers disagree on runId");
  }
  return { latest, manifest, summary };
}

export async function verifyRun({
  logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs",
  run = "latest"
} = {}) {
  const paths = await resolveRunPaths(logRoot, run);
  const manifest = await readJson(paths.manifestPath);
  const summaryText = await readFile(paths.summaryPath, "utf8");
  const summary = JSON.parse(summaryText);
  const eventBytes = await readFile(paths.eventsPath);
  const eventText = eventBytes.toString("utf8");
  const lines = eventText.split("\n").filter(Boolean);
  const errors = [];
  const events = [];

  for (const [index, line] of lines.entries()) {
    try {
      const record = JSON.parse(line);
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        errors.push(`invalid_event_shape:${index + 1}`);
      } else {
        events.push(record);
      }
    } catch {
      errors.push(`invalid_json_line:${index + 1}`);
    }
  }

  if (paths.runId !== manifest.runId) errors.push("selected_run_id_mismatch");
  if (manifest.schemaVersion !== EVENT_SCHEMA_VERSION) errors.push("manifest_schema_version_mismatch");
  if (summary.schemaVersion !== EVENT_SCHEMA_VERSION) errors.push("summary_schema_version_mismatch");
  if (summary.runId !== manifest.runId) errors.push("summary_run_id_mismatch");
  if (summary.status !== manifest.status) errors.push("summary_status_mismatch");
  for (const [index, event] of events.entries()) {
    for (const field of REQUIRED_EVENT_FIELDS) {
      if (!Object.hasOwn(event, field)) errors.push(`missing_field:${index + 1}:${field}`);
    }
    if (Number.isNaN(new Date(event.timestamp).getTime())) errors.push(`invalid_timestamp:${index + 1}`);
    if (!LOG_LEVELS.includes(event.level)) errors.push(`invalid_level:${index + 1}`);
  }
  const runIds = new Set(events.map((event) => event.runId));
  if (runIds.size !== 1 || !runIds.has(manifest.runId)) errors.push("run_id_mismatch");
  if (events.some((event) => event.schemaVersion !== EVENT_SCHEMA_VERSION)) errors.push("schema_version_mismatch");
  if (events.some((event) => event.eventVersion !== EVENT_VERSION)) errors.push("event_version_mismatch");
  if (events.some((event, index) => event.sequence !== index + 1)) errors.push("sequence_mismatch");
  if (new Set(events.map((event) => event.eventId)).size !== events.length) errors.push("duplicate_event_id");
  const started = events.filter((event) => event.event === "run.started");
  if (started.length !== 1) errors.push(`start_event_count:${started.length}`);
  const terminal = events.filter((event) => TERMINAL_EVENTS.includes(event.event));
  if (terminal.length !== 1) errors.push(`terminal_event_count:${terminal.length}`);
  if (terminal[0] && terminal[0] !== events.at(-1)) errors.push("terminal_event_not_last");
  if (terminal[0]?.eventId !== manifest.terminalEventId) errors.push("terminal_event_mismatch");
  if (terminal[0]?.event !== manifest.terminalEvent) errors.push("terminal_event_name_mismatch");
  if (terminal[0]?.status !== manifest.status) errors.push("terminal_status_mismatch");
  if (events.length !== manifest.eventCount) errors.push("event_count_mismatch");
  const digest = createHash("sha256").update(eventBytes).digest("hex");
  if (digest !== manifest.integrity?.eventsDigest) errors.push("events_digest_mismatch");
  if (eventBytes.byteLength !== manifest.integrity?.eventsBytes) errors.push("events_bytes_mismatch");
  if (containsUnredactedSensitiveValue(`${eventText}\n${summaryText}\n${JSON.stringify(manifest)}`)) {
    errors.push("unredacted_sensitive_value");
  }
  errors.push(...await verifyCommandLog(logRoot, manifest.runId));

  return {
    ok: errors.length === 0,
    schemaVersion: EVENT_SCHEMA_VERSION,
    runId: manifest.runId,
    status: manifest.status,
    eventCount: events.length,
    terminalEvent: terminal[0]?.event || "",
    digest,
    errors
  };
}

export async function queryEvents({
  logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs",
  run = "latest",
  level,
  component,
  event,
  status,
  since
} = {}) {
  const paths = await resolveRunPaths(logRoot, run);
  const text = await readFile(paths.eventsPath, "utf8");
  return filterRecords(parseJsonLines(text, "run_events"), { level, component, event, status, since });
}

export async function queryCommandEvents({
  logRoot = process.env.NEWSLETTER_LOG_DIR || ".newsletter-logs",
  run = "all",
  level,
  component,
  event,
  status,
  since
} = {}) {
  let selectedRun = run;
  if (run === "latest") selectedRun = (await readJson(path.join(logRoot, "LATEST.json"))).runId;
  if (selectedRun !== "all" && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(String(selectedRun))) {
    throw new Error("Unsafe command run selector");
  }
  let text;
  try {
    text = await readFile(path.join(logRoot, "commands.jsonl"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return filterRecords(parseJsonLines(text, "command_events"), { level, component, event, status, since })
    .filter((record) => selectedRun === "all" || record.runId === selectedRun);
}

export async function resolveRunPaths(logRoot, run = "latest") {
  if (run === "latest") {
    const latest = await readJson(path.join(logRoot, "LATEST.json"));
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(String(latest.runId || ""))) {
      throw new Error("LATEST.json has an invalid runId");
    }
    return {
      runId: latest.runId,
      manifestPath: resolveContained(logRoot, latest.manifest, "manifest"),
      summaryPath: resolveContained(logRoot, latest.summary, "summary"),
      eventsPath: resolveContained(logRoot, latest.events, "events")
    };
  }

  const safeRun = String(run);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(safeRun)) throw new Error("Unsafe run selector");
  const dateEntries = await readdir(logRoot, { withFileTypes: true });
  for (const dateEntry of dateEntries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name))) {
    const runDirectory = path.join(logRoot, dateEntry.name, safeRun);
    try {
      await readFile(path.join(runDirectory, "run-manifest.json"));
      return {
        runId: safeRun,
        manifestPath: path.join(runDirectory, "run-manifest.json"),
        summaryPath: path.join(runDirectory, "summary.json"),
        eventsPath: path.join(runDirectory, "events.jsonl")
      };
    } catch {
      // Keep looking in older date buckets.
    }
  }
  throw new Error(`Run not found: ${safeRun}`);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseSince(value) {
  const match = /^(\d+)(m|h|d)$/.exec(String(value));
  if (!match) throw new Error("--since must use Nm, Nh, or Nd");
  const multiplier = match[2] === "m" ? 60000 : match[2] === "h" ? 3600000 : 86400000;
  return Date.now() - Number(match[1]) * multiplier;
}

function parseJsonLines(text, label) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line, index) => {
      try {
        const record = JSON.parse(line);
        if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("invalid shape");
        return record;
      } catch {
        throw new Error(`${label}_invalid_json_line:${index + 1}`);
      }
    });
}

function filterRecords(records, { level, component, event, status, since }) {
  const threshold = since ? parseSince(since) : null;
  return records
    .filter((record) => !level || record.level === level)
    .filter((record) => !component || record.component === component)
    .filter((record) => !event || record.event === event)
    .filter((record) => !status || record.status === status)
    .filter((record) => !threshold || new Date(record.timestamp).getTime() >= threshold);
}

async function verifyCommandLog(logRoot, runId) {
  let text;
  try {
    text = await readFile(path.join(logRoot, "commands.jsonl"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    return ["command_log_unreadable"];
  }

  let records;
  try {
    records = parseJsonLines(text, "command_events");
  } catch {
    return ["command_log_invalid_json"];
  }
  const errors = [];
  const selected = records.filter((record) => record.runId === runId);
  if (selected.some((record) => record.schemaVersion !== EVENT_SCHEMA_VERSION)) errors.push("command_schema_version_mismatch");
  if (selected.some((record) => record.eventVersion !== EVENT_VERSION)) errors.push("command_event_version_mismatch");
  if (new Set(records.map((record) => record.eventId)).size !== records.length) errors.push("duplicate_command_event_id");
  if (selected.some((record) => REQUIRED_EVENT_FIELDS.some((field) => !Object.hasOwn(record, field)))) {
    errors.push("command_missing_required_field");
  }
  if (containsUnredactedSensitiveValue(text)) errors.push("command_unredacted_sensitive_value");
  return errors;
}

function resolveContained(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath === "" || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid ${label} path in observability pointer`);
  }
  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, relativePath);
  if (!resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Unsafe ${label} path in observability pointer`);
  }
  return resolved;
}
