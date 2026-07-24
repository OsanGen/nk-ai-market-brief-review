export const EVENT_SCHEMA_VERSION = 1;
export const EVENT_VERSION = 1;
export const LOG_LEVELS = ["debug", "info", "warn", "error", "fatal"];
export const TERMINAL_EVENTS = ["run.completed", "run.failed"];
export const REQUIRED_EVENT_FIELDS = [
  "schemaVersion",
  "eventVersion",
  "timestamp",
  "eventId",
  "runId",
  "correlationId",
  "sequence",
  "level",
  "event",
  "component",
  "status"
];

export function eventCatalogDocument() {
  return {
    schemaVersion: EVENT_SCHEMA_VERSION,
    format: "jsonl",
    description: "Agent-first event contract for the NK AI Market Brief.",
    envelope: {
      required: REQUIRED_EVENT_FIELDS,
      optional: [
        "phase",
        "reasonCode",
        "durationMs",
        "environment",
        "trigger",
        "commitSha",
        "workflowRunId",
        "workflowRunAttempt",
        "attributes"
      ]
    },
    levels: LOG_LEVELS,
    terminalEvents: TERMINAL_EVENTS,
    lifecycle: {
      exactlyOneTerminalEvent: true,
      terminalStatus: ["completed", "degraded", "skipped", "failed"]
    },
    dynamicComponents: {
      registrationRequired: false,
      discovery: "components are recorded when they emit an event",
      customMetadata: "component definitions are preserved in run-manifest.json"
    },
    privacy: {
      publicReceipt: "strict allowlist",
      secrets: "recursive redaction",
      emailAddresses: "redacted",
      urls: "query strings and fragments removed",
      rawExternalPayloads: "forbidden"
    }
  };
}
