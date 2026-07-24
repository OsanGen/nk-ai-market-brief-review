import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { runNewsletter } from "../src/run-newsletter.mjs";

test("auto mode outside the 4 a.m. window skips before sending and writes a terminal skip record", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "newsletter-autoskip-"));
  const logRoot = path.join(workDir, "logs");
  const originalCwd = process.cwd();
  // 2026-05-08T18:00Z == 2 p.m. EDT, well outside the 4 a.m. target window.
  const now = new Date("2026-05-08T18:00:00.000Z");

  let result;
  const originalFetch = globalThis.fetch;
  try {
    process.chdir(workDir);
    // The guard must short-circuit before any fetch happens.
    globalThis.fetch = async () => {
      throw new Error("fetch must not be called on the skip path");
    };
    result = await runNewsletter({
      mode: "auto",
      now,
      force: false,
      env: { NEWSLETTER_OUTPUT_DIR: path.join(workDir, "outbox") },
      observability: { runId: "auto-skip-run", logRoot, stdout: null, now: () => now }
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(originalCwd);
  }

  assert.equal(result.skipped, true);
  assert.equal(result.skippedReason, "outside_target_window");
  assert.equal(result.send.sent, false);
  assert.equal(result.sendStatus, "outside_target_window");

  const events = (await readFile(path.join(logRoot, "2026-05-08", "auto-skip-run", "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const terminal = events.filter((event) => ["run.completed", "run.failed"].includes(event.event));
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0].event, "run.completed");

  const summary = JSON.parse(
    await readFile(path.join(logRoot, "2026-05-08", "auto-skip-run", "summary.json"), "utf8")
  );
  assert.equal(summary.status, "skipped");
});
