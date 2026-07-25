import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { AUTOMATION_SCHEDULE, getAutomationStatus, WORKFLOW_PATH } from "../src/automation-status.mjs";
import { localDateKey } from "../src/live-freshness.mjs";
import { writeMachineRecord } from "../src/observability/machine-record.mjs";
import { serializeError } from "../src/observability/redaction.mjs";

const required = [
  "site/index.html",
  "site/newsletter.txt",
  "site/run.json",
  ".github/workflows/newsletter.yml",
  ".env.example",
  "SHARE_WITH_CYRIL.md",
  "FULL_TECH_BUILD.txt"
];
const forbidden = /RESEND_API_KEY|OPENAI_API_KEY|<script|onerror|onclick|javascript:|metadata matched|matched filters/i;
const indexMarkers = ["NK AI Market Brief", "Internal review", "Email disabled", "newsletter.txt", "Read source"];

export async function checkDeploy(root = process.cwd()) {
  for (const file of required) await access(path.join(root, file));
  const run = JSON.parse(await readFile(path.join(root, "site/run.json"), "utf8"));
  const expectsDaily = process.env.NEWSLETTER_EXPECT_MODE?.trim() === "auto";

  checkPublicRunReceipt(run);
  checkPipelineHealth(run);

  for (const file of ["site/index.html", "site/newsletter.txt"]) {
    const text = await readFile(path.join(root, file), "utf8");
    if (forbidden.test(text)) throw new Error(`Forbidden public-output pattern in ${file}`);
    if (file === "site/index.html") {
      for (const marker of indexMarkersFor(run, expectsDaily)) {
        if (!text.includes(marker)) throw new Error(`Missing "${marker}" in site/index.html`);
      }
    }
  }

  if (!run.reviewReady && !expectsDaily && process.env.ALLOW_NOT_READY_REVIEW !== "true") {
    throw new Error(`Review page is not ready: ${(run.reviewReasons ?? []).join(" ") || "reviewReady=false"}`);
  }
  checkExpectedMode(run);
  checkExpectedLookback(run);
  checkExpectedFreshDate(run);
  await checkWorkflow(root);
  if (run.automationConfigured !== true) throw new Error("site/run.json automationConfigured is not true");
  if (run.scheduledRefreshConfigured !== true) throw new Error("site/run.json scheduledRefreshConfigured is not true");
  if (run.observabilityConfigured !== true) throw new Error("site/run.json observabilityConfigured is not true");
  if (run.liveVerificationConfigured !== true) throw new Error("site/run.json liveVerificationConfigured is not true");
  return run;
}

function checkPipelineHealth(run) {
  if (run.health?.pipelineStatus === "failed") {
    throw new Error(`site/run.json pipeline health failed: ${(run.health.reasonCodes ?? []).join(",") || "pipeline_failed"}`);
  }
  const sourceCount = Number(run.sourceCount);
  const sourceErrorCount = Number(run.sourceErrorCount);
  if (sourceCount > 0 && sourceErrorCount >= sourceCount) {
    throw new Error("site/run.json reports all configured sources failed");
  }
}

function checkPublicRunReceipt(run) {
  const forbiddenKeys = /^(?:messageId|messageIdFingerprint|error|errorMessage|stack|authorization|password|secret|token|cookie|recipients?|to|cc|bcc|replyTo)$/i;
  const email = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && email.test(value)) throw new Error("Public site/run.json contains an email address");
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (forbiddenKeys.test(key)) throw new Error(`Forbidden public site/run.json field: ${key}`);
      visit(child);
    }
  };
  visit(run);
}

function indexMarkersFor(run, expectsDaily) {
  let markers = indexMarkers;
  // Gated (Velvet Rope) editions omit the plaintext newsletter.txt side-door,
  // so the in-page link marker must not be required.
  if (run.gated) markers = markers.filter((marker) => marker !== "newsletter.txt");
  if (expectsDaily && Number(run.itemCount ?? run.selectedItemCount ?? 0) === 0) {
    markers = markers.filter((marker) => marker !== "Read source");
  }
  return markers;
}

function checkExpectedMode(run) {
  const expectedMode = process.env.NEWSLETTER_EXPECT_MODE?.trim();
  if (expectedMode && run.mode !== expectedMode) {
    throw new Error(`Expected site/run.json mode ${expectedMode}, got ${run.mode ?? "missing"}`);
  }
}

function checkExpectedLookback(run) {
  const maxActiveLookbackHours = optionalNumber("NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS");
  if (maxActiveLookbackHours === undefined) return;

  const activeLookbackHours = Number(run.config?.activeLookbackHours);
  if (!Number.isFinite(activeLookbackHours)) {
    throw new Error("site/run.json config.activeLookbackHours is missing or invalid");
  }
  if (activeLookbackHours > maxActiveLookbackHours) {
    throw new Error(`site/run.json active lookback ${activeLookbackHours} exceeds ${maxActiveLookbackHours}`);
  }
}

function checkExpectedFreshDate(run) {
  if (process.env.NEWSLETTER_EXPECT_FRESH_DATE !== "true") return;

  const generatedAt = new Date(run.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) throw new Error("site/run.json generatedAt is missing or invalid");

  const now = process.env.NEWSLETTER_NOW ? new Date(process.env.NEWSLETTER_NOW) : new Date();
  const timezone = run.config?.timezone || process.env.NEWSLETTER_TIMEZONE || "America/New_York";
  if (localDateKey(generatedAt, timezone) !== localDateKey(now, timezone)) {
    throw new Error(`site/run.json generatedAt is not fresh for ${localDateKey(now, timezone)}`);
  }
}

function optionalNumber(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

async function checkWorkflow(root) {
  const workflow = await readFile(path.join(root, WORKFLOW_PATH), "utf8");
  const checks = [
    ["workflow_dispatch", workflow.includes("workflow_dispatch")],
    ["configured daily refresh cron entries", AUTOMATION_SCHEDULE.every((cron) => workflow.includes(`cron: \"${cron}\"`) || workflow.includes(`cron: '${cron}'`))],
    ["NEWSLETTER_TARGET_HOUR_LOCAL: \"4\"", workflow.includes('NEWSLETTER_TARGET_HOUR_LOCAL: "4"')],
    ["npm run should:refresh", workflow.includes("npm run should:refresh")],
    ["npm run daily", workflow.includes("npm run daily")],
    ["npm run logs:verify", workflow.includes("npm run logs:verify")],
    ["NEWSLETTER_EXPECT_MODE=auto", workflow.includes("NEWSLETTER_EXPECT_MODE=auto")],
    ["NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84", workflow.includes("NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84")],
    ["NEWSLETTER_EXPECT_FRESH_DATE=true", workflow.includes("NEWSLETTER_EXPECT_FRESH_DATE=true")],
    ["npm run check:live", workflow.includes("npm run check:live")],
    ["actions/upload-artifact", workflow.includes("actions/upload-artifact")],
    ["machine log artifact", workflow.includes(".newsletter-logs")],
    ["explicit artifact retention", workflow.includes("retention-days: 30")],
    ["failure evidence upload", workflow.includes("always()")],
    ["exact live run verification", workflow.includes("NEWSLETTER_EXPECT_LIVE_RUN_ID")],
    ["deployment outcome correlation", workflow.includes("steps.deployment.outcome")],
    ["actions/upload-pages-artifact", workflow.includes("actions/upload-pages-artifact")],
    ["actions/deploy-pages", workflow.includes("actions/deploy-pages")],
    ["pages: write", workflow.includes("pages: write")],
    ["id-token: write", workflow.includes("id-token: write")]
  ];
  for (const [label, ok] of checks) {
    if (!ok) throw new Error(`Workflow missing ${label}`);
  }

  const automation = await getAutomationStatus(root);
  if (!automation.automationConfigured) throw new Error("Workflow automation is not fully configured");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const run = await checkDeploy();
    writeMachineRecord({
      event: "deployment.candidate.verify.completed",
      component: "deploy_check",
      phase: "deploy_verify",
      status: "completed",
      runId: run.runId,
      attributes: {
        mode: run.mode,
        itemCount: run.itemCount,
        pipelineStatus: run.health?.pipelineStatus,
        contentStatus: run.health?.contentStatus
      }
    });
  } catch (error) {
    const failure = serializeError(error);
    writeMachineRecord({
      event: "deployment.candidate.verify.failed",
      level: "error",
      component: "deploy_check",
      phase: "deploy_verify",
      status: "failed",
      reasonCode: failure.errorCode,
      attributes: { error: failure }
    });
    process.exitCode = 1;
  }
}
