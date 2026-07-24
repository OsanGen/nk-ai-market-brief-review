import test from "node:test";
import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { writeMachineRecord } from "../src/observability/machine-record.mjs";
import { queryCommandEvents, queryEvents, readLatestStatus, verifyRun } from "../src/observability/reader.mjs";
import { startTelemetryRun } from "../src/observability/telemetry.mjs";

const fixedNow = () => new Date("2026-07-22T12:00:00.000Z");

test("agent-first telemetry is compact, redacted, integrity-checked, and dynamically discoverable", async () => {
  const logRoot = await temporaryLogRoot("newsletter-observability-");
  const stdout = captureStream();
  const telemetry = await startTelemetryRun({
    mode: "preview",
    logRoot,
    runId: "dynamic-run-1",
    stdout,
    now: fixedNow,
    env: {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_RUN_ID: "991",
      GITHUB_RUN_ATTEMPT: "2",
      GITHUB_SHA: "abc123"
    }
  });

  telemetry.registerComponent("future_adapter", { role: "plugin_adapter", version: 7 });
  await telemetry.event({
    event: "future_adapter.call.completed",
    component: "future_adapter",
    phase: "future_adapter.call",
    status: "completed",
    durationMs: 7.4,
    attributes: {
      apiKey: ["sk", "test", "12345678901234567890"].join("-"),
      ownerEmail: "operator@example.com",
      authorization: "Bearer abcdefghijklmnopqrstuvwxyz",
      feedUrl: "https://reader:password@example.com/feed?token=secret#private",
      note: "contact operator@example.com"
    }
  });
  await telemetry.event({
    event: "future_worker.output.observed",
    component: "future_worker",
    phase: "future_worker.output",
    status: "observed",
    attributes: { itemCount: 3 }
  });
  await assert.rejects(
    telemetry.event({ event: "run.completed", component: "newsletter", status: "completed" }),
    /must be emitted through complete\(\) or fail\(\)/
  );
  await telemetry.complete({
    status: "degraded",
    reasonCode: "partial source failure",
    health: { status: "degraded", pipelineStatus: "degraded" },
    summary: { itemCount: 3 }
  });

  const verification = await verifyRun({ logRoot, run: "dynamic-run-1" });
  assert.equal(verification.ok, true, verification.errors.join(","));
  assert.equal(verification.terminalEvent, "run.completed");
  assert.equal(verification.eventCount, 4);

  const { manifest, summary } = await readLatestStatus(logRoot);
  assert.equal(manifest.runId, "dynamic-run-1");
  assert.equal(manifest.status, "degraded");
  assert.equal(summary.health.pipelineStatus, "degraded");
  assert.deepEqual(
    manifest.components.map((component) => component.name),
    ["future_adapter", "future_worker", "newsletter"]
  );
  assert.equal(manifest.components.find((component) => component.name === "future_adapter").definition.version, 7);

  const queried = await queryEvents({ logRoot, run: "latest", component: "future_adapter" });
  assert.equal(queried.length, 1);
  assert.equal(queried[0].durationMs, 7);
  assert.equal(queried[0].attributes.apiKey, "<redacted>");
  assert.equal(queried[0].attributes.ownerEmail, "<redacted:email>");
  assert.equal(queried[0].attributes.feedUrl, "https://example.com/feed");

  const raw = await readFile(telemetry.paths.eventsPath, "utf8");
  assert.doesNotMatch(raw, /sk-test|operator@example\.com|password|token=secret|Bearer abcdef/);
  assert.equal(raw.trim().split("\n").every((line) => !line.includes("\n  ")), true);
  assert.equal(stdout.text, raw);
  assert.equal((await stat(telemetry.paths.runDirectory)).mode & 0o077, 0);
  assert.equal((await stat(telemetry.paths.eventsPath)).mode & 0o077, 0);
  await assert.rejects(
    telemetry.event({ event: "future_worker.late", component: "future_worker" }),
    /after terminal event/
  );
});

test("telemetry failure terminal redacts secrets and remains verifiable", async () => {
  const logRoot = await temporaryLogRoot("newsletter-observability-failure-");
  const telemetry = await startTelemetryRun({
    mode: "auto",
    logRoot,
    runId: "failed-run-1",
    stdout: captureStream(),
    now: fixedNow
  });
  const failure = Object.assign(
    new Error(`Bearer abcdefghijklmnopqrstuvwxyz failed for operator@example.com with ${["sk", "test", "12345678901234567890"].join("-")}`),
    { code: "EHOSTUNREACH" }
  );
  await telemetry.fail(failure, { component: "future_adapter", phase: "future_adapter.call" });

  const verification = await verifyRun({ logRoot, run: "failed-run-1" });
  assert.equal(verification.ok, true, verification.errors.join(","));
  assert.equal(verification.status, "failed");
  assert.equal(verification.terminalEvent, "run.failed");
  const raw = await readFile(telemetry.paths.eventsPath, "utf8");
  assert.doesNotMatch(raw, /operator@example\.com|sk-test|Bearer abcdef/);
});

test("verifier detects tampering and unredacted sensitive content", async () => {
  const logRoot = await temporaryLogRoot("newsletter-observability-tamper-");
  const telemetry = await startTelemetryRun({
    logRoot,
    runId: "tamper-run-1",
    stdout: captureStream(),
    now: fixedNow
  });
  await telemetry.complete({ status: "completed" });
  await appendFile(
    telemetry.paths.eventsPath,
    `${JSON.stringify({ runId: "tamper-run-1", message: "operator@example.com" })}\n`,
    "utf8"
  );

  const verification = await verifyRun({ logRoot, run: "tamper-run-1" });
  assert.equal(verification.ok, false);
  assert.ok(verification.errors.includes("events_digest_mismatch"));
  assert.ok(verification.errors.includes("events_bytes_mismatch"));
  assert.ok(verification.errors.includes("unredacted_sensitive_value"));
});

test("reader rejects traversal in mutable latest pointers", async () => {
  const logRoot = await temporaryLogRoot("newsletter-observability-pointer-");
  await writeFile(
    path.join(logRoot, "LATEST.json"),
    `${JSON.stringify({ runId: "safe-run", manifest: "../outside.json", summary: "summary.json", events: "events.jsonl" })}\n`,
    "utf8"
  );
  await assert.rejects(readLatestStatus(logRoot), /Unsafe manifest path/);
});

test("current run verification tolerates older command schema records from unrelated runs", async () => {
  const logRoot = await temporaryLogRoot("newsletter-observability-schema-drift-");
  const telemetry = await startTelemetryRun({
    logRoot,
    runId: "current-schema-run",
    stdout: captureStream(),
    now: fixedNow
  });
  await telemetry.complete({ status: "completed" });
  await writeFile(path.join(logRoot, "commands.jsonl"), `${JSON.stringify({
    schemaVersion: 0,
    eventVersion: 0,
    timestamp: "2025-01-01T00:00:00.000Z",
    eventId: "historical-run:legacy:1",
    runId: "historical-run",
    correlationId: "historical-run",
    sequence: 0,
    level: "info",
    event: "legacy.completed",
    component: "legacy",
    status: "completed"
  })}\n`, "utf8");

  const verification = await verifyRun({ logRoot, run: "current-schema-run" });
  assert.equal(verification.ok, true, verification.errors.join(","));
});

test("writer rejects a log root inside public site output", async () => {
  await assert.rejects(
    startTelemetryRun({ logRoot: "site/machine-logs", runId: "unsafe-log-root", stdout: captureStream() }),
    /must not be inside public site output/
  );
});

test("standalone machine records persist with unique IDs and recursive redaction", async () => {
  const logRoot = await temporaryLogRoot("newsletter-command-events-");
  const stdout = captureStream();
  const first = writeMachineRecord({
    event: "refresh.decision",
    component: "refresh_gate",
    phase: "refresh_decision",
    status: "skip",
    reasonCode: "Already Fresh",
    runId: "gate-run-1",
    attributes: { apiToken: ["ghp", "12345678901234567890"].join("_"), ownerEmail: "operator@example.com" }
  }, { logRoot, stream: stdout });
  const second = writeMachineRecord({
    event: "refresh.decision",
    component: "refresh_gate",
    phase: "refresh_decision",
    status: "run",
    runId: "gate-run-1"
  }, { logRoot, stream: stdout });

  assert.notEqual(first.eventId, second.eventId);
  assert.equal(first.reasonCode, "already_fresh");
  const raw = await readFile(path.join(logRoot, "commands.jsonl"), "utf8");
  assert.equal(raw, stdout.text);
  assert.equal(raw.trim().split("\n").length, 2);
  assert.doesNotMatch(raw, /ghp_|operator@example\.com/);
  const queried = await queryCommandEvents({ logRoot, run: "gate-run-1", event: "refresh.decision" });
  assert.equal(queried.length, 2);
});

test("a transient event-append failure does not poison the queue: the terminal run.failed record is still written", async () => {
  const logRoot = await temporaryLogRoot("newsletter-poison-");
  let call = 0;
  // Fail exactly one interior append (the second one), then let later appends —
  // including the terminal run.failed event — succeed. Before the fix, the rejected
  // queue permanently skipped every subsequent append, so run.failed + finalize()
  // never happened and the run ended with no terminal record on disk.
  const appendImpl = async (...args) => {
    call += 1;
    if (call === 2) throw new Error("simulated ENOSPC");
    return appendFile(...args);
  };

  const telemetry = await startTelemetryRun({
    mode: "auto",
    logRoot,
    runId: "poison-run-1",
    stdout: null,
    now: fixedNow,
    env: {},
    appendImpl
  });

  // This is the append that fails; the caller sees the error (as run-newsletter would).
  await assert.rejects(
    telemetry.event({ event: "content.filter.started", component: "content", status: "started" }),
    /simulated ENOSPC/
  );

  // The orchestrator would now route to fail(); the terminal event must still persist.
  const reference = await telemetry.fail(new Error("boom"));
  assert.equal(reference.status, "failed");

  const { manifest, summary } = await readLatestStatus(logRoot);
  assert.equal(manifest.runId, "poison-run-1");
  assert.equal(manifest.status, "failed");
  assert.equal(manifest.terminalEvent, "run.failed");
  assert.equal(summary.status, "failed");

  const events = (await readFile(path.join(logRoot, "2026-07-22", "poison-run-1", "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const terminal = events.filter((event) => ["run.completed", "run.failed"].includes(event.event));
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].event, "run.failed");
});

async function temporaryLogRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function captureStream() {
  return {
    text: "",
    write(chunk) {
      this.text += String(chunk);
    }
  };
}
