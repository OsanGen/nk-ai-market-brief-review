import { parseArgs } from "node:util";

import { queryCommandEvents, queryEvents } from "../src/observability/reader.mjs";
import { serializeError } from "../src/observability/redaction.mjs";

const { values } = parseArgs({
  options: {
    run: { type: "string", default: "latest" },
    stream: { type: "string", default: "run" },
    level: { type: "string" },
    component: { type: "string" },
    event: { type: "string" },
    status: { type: "string" },
    since: { type: "string" },
    "log-root": { type: "string" }
  },
  strict: true
});

try {
  if (!["run", "commands", "all"].includes(values.stream)) throw new Error("--stream must be run, commands, or all");
  if (values.run === "all" && values.stream !== "commands") throw new Error("--run all is only valid with --stream commands");
  const filters = {
    run: values.run,
    level: values.level,
    component: values.component,
    event: values.event,
    status: values.status,
    since: values.since,
    logRoot: values["log-root"]
  };
  const events = values.stream === "commands"
    ? await queryCommandEvents(filters)
    : values.stream === "all"
      ? [
          ...await queryEvents(filters),
          ...await queryCommandEvents(filters)
        ].sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.eventId.localeCompare(right.eventId))
      : await queryEvents(filters);
  for (const event of events) process.stdout.write(`${JSON.stringify(event)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({ ok: false, ...serializeError(error) })}\n`);
  process.exitCode = 1;
}
