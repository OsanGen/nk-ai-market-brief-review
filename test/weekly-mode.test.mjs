import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadConfig } from "../src/config.mjs";
import { WEEKLY_SEND_SKIP_REASON, runNewsletter, weeklySendGuard } from "../src/run-newsletter.mjs";
import { sendNewsletter } from "../src/send-resend.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const fromEmail = ["brief", ["example", "invalid"].join(".")].join("@");
const toEmail = ["team", ["example", "invalid"].join(".")].join("@");

test("Send gate refuses weekly mode even with full email config, without calling the provider", async () => {
  let called = false;
  const result = await sendNewsletter({
    mode: "weekly",
    html: "<p>Weekly</p>",
    text: "Weekly",
    stories: [{ title: "AI fashion" }, { title: "AI beauty" }, { title: "Agentic commerce" }],
    date: "2026-05-08",
    config: { sendEnabled: true, from: fromEmail, to: [toEmail], cc: [], minItems: 3, resendApiKey: "unit-test-placeholder" },
    fetchImpl: async () => {
      called = true;
      throw new Error("fetch should not be called");
    }
  });

  assert.equal(called, false);
  assert.equal(result.sent, false);
  assert.equal(result.skippedReason, "not_send_mode");
});

test("weeklySendGuard blocks only weekly mode and leaves other modes on the send gate", () => {
  assert.deepEqual(weeklySendGuard("weekly"), {
    sent: false,
    messageIdFingerprint: "",
    skippedReason: WEEKLY_SEND_SKIP_REASON
  });
  assert.equal(weeklySendGuard("preview"), null);
  assert.equal(weeklySendGuard("auto"), null);
  assert.equal(weeklySendGuard("send"), null);
});

test("Weekly mode uses the review lookback window", () => {
  const config = loadConfig({}, new Date("2026-05-08T12:00:00Z"), { mode: "weekly" });
  assert.equal(config.activeLookbackHours, config.reviewLookbackHours);
  assert.equal(config.activeLookbackHours, 168);
});

test("scripts/weekly.mjs hard-disables the send gate and never routes through the send command", async () => {
  const weeklyScript = await readFile(path.join(projectRoot, "scripts", "weekly.mjs"), "utf8");
  assert.match(weeklyScript, /NEWSLETTER_SEND_ENABLED = "false"/);
  assert.match(weeklyScript, /mode: "weekly"/);
  assert.doesNotMatch(weeklyScript, /requireSend/);
  assert.doesNotMatch(weeklyScript, /send-resend/);

  const orchestrator = await readFile(path.join(projectRoot, "src", "run-newsletter.mjs"), "utf8");
  assert.match(orchestrator, /weeklySendGuard\(mode\) \?\?/);
});

test("A full weekly run emits one terminal receipt and a coverage receipt without ever touching the send path", async () => {
  const workDir = await mkdtemp(path.join(os.tmpdir(), "newsletter-weekly-"));
  const logRoot = path.join(workDir, "logs");
  const outputDir = path.join(workDir, "outbox");
  await mkdir(path.join(workDir, "config"), { recursive: true });
  await copyFile(
    path.join(projectRoot, "config", "source-registry.json"),
    path.join(workDir, "config", "source-registry.json")
  );
  await copyFile(
    path.join(projectRoot, "config", "model-registry.json"),
    path.join(workDir, "config", "model-registry.json")
  );

  const fixtureXml = await readFile(path.join(projectRoot, "fixtures", "google-news-agentic-commerce.xml"), "utf8");
  const fetchedUrls = [];
  const originalFetch = globalThis.fetch;
  const originalCwd = process.cwd();
  const now = new Date("2026-05-08T12:00:00Z");

  let result;
  try {
    process.chdir(workDir);
    globalThis.fetch = async (url) => {
      fetchedUrls.push(String(url));
      return { ok: true, status: 200, text: async () => fixtureXml };
    };

    result = await runNewsletter({
      mode: "weekly",
      now,
      env: {
        // Even with the send gate fully armed, weekly must never send.
        NEWSLETTER_SEND_ENABLED: "true",
        NEWSLETTER_FROM: fromEmail,
        NEWSLETTER_TO: toEmail,
        RESEND_API_KEY: "unit-test-placeholder",
        NEWSLETTER_OUTPUT_DIR: outputDir
      },
      observability: {
        runId: "weekly-e2e-run",
        logRoot,
        stdout: null,
        now: () => now
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
    process.chdir(originalCwd);
  }

  assert.equal(result.mode, "weekly");
  assert.deepEqual(result.send, {
    sent: false,
    messageIdFingerprint: "",
    skippedReason: WEEKLY_SEND_SKIP_REASON
  });
  assert.equal(result.sendStatus, WEEKLY_SEND_SKIP_REASON);
  assert.equal(result.config.activeLookbackHours, 168);
  assert.equal(result.weekId, "2026-W19");
  assert.equal(result.coverage.weekId, "2026-W19");
  assert.equal(result.coverage.registryCompleteness, "seed_only");
  assert.equal(result.coverage.knownBlindSpots.includes("website_pattern_panel"), true);

  // The authoritative model policy is recorded on every run, even though the AI
  // lane is inactive: Opus 4.8 primary, lane planned/off.
  assert.equal(result.modelPolicy.primaryReasoningModel, "claude-opus-4-8");
  assert.equal(result.modelPolicy.laneActive, false);
  assert.equal(result.modelPolicy.status, "planned");

  assert.equal(fetchedUrls.length, 40);
  assert.equal(fetchedUrls.every((url) => url.startsWith("https://news.google.com/rss/search")), true);
  assert.equal(fetchedUrls.some((url) => url.includes("resend")), false);

  const runDirectory = path.join(logRoot, "2026-05-08", "weekly-e2e-run");
  const receipt = JSON.parse(await readFile(path.join(runDirectory, "coverage-receipt.json"), "utf8"));
  assert.equal(receipt.run_id, "weekly-e2e-run");
  assert.equal(receipt.week_id, "2026-W19");
  assert.equal(receipt.per_source.length, 40);

  const events = (await readFile(path.join(runDirectory, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const terminalEvents = events.filter((event) => ["run.completed", "run.failed"].includes(event.event));
  assert.equal(terminalEvents.length, 1);
  assert.equal(terminalEvents[0].event, "run.completed");
  assert.equal(events.some((event) => event.event === "coverage.receipt.written"), true);
  assert.equal(events.some((event) => event.event === "model.policy.recorded"), true);
  const sendEvents = events.filter((event) => event.event.startsWith("email.send"));
  assert.equal(sendEvents.every((event) => event.status !== "accepted"), true);
  assert.equal(sendEvents.some((event) => event.reasonCode === WEEKLY_SEND_SKIP_REASON), true);
});
