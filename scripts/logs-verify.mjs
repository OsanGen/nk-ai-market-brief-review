import { parseArgs } from "node:util";

import { writeMachineRecord } from "../src/observability/machine-record.mjs";
import { verifyRun } from "../src/observability/reader.mjs";
import { serializeError } from "../src/observability/redaction.mjs";

const { values } = parseArgs({
  options: {
    run: { type: "string" },
    "log-root": { type: "string" }
  },
  strict: true
});

try {
  const run = values.run || process.env.NEWSLETTER_RUN_ID || "latest";
  const result = await verifyRun({ run, logRoot: values["log-root"] });
  writeMachineRecord({
    event: result.ok ? "observability.verify.completed" : "observability.verify.failed",
    level: result.ok ? "info" : "error",
    component: "observability",
    phase: "run_verify",
    status: result.ok ? "completed" : "failed",
    reasonCode: result.errors[0] || "",
    runId: result.runId,
    attributes: { eventCount: result.eventCount, terminalEvent: result.terminalEvent, errors: result.errors }
  }, { stream: null, logRoot: values["log-root"] });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  const failure = serializeError(error);
  writeMachineRecord({
    event: "observability.verify.failed",
    level: "error",
    component: "observability",
    phase: "run_verify",
    status: "failed",
    reasonCode: failure.errorCode,
    attributes: { error: failure }
  }, { stream: null, logRoot: values["log-root"] });
  process.stdout.write(`${JSON.stringify({ ok: false, ...failure })}\n`);
  process.exitCode = 1;
}
