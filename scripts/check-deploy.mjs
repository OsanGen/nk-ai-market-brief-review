import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { AUTOMATION_SCHEDULE, getAutomationStatus, WORKFLOW_PATH } from "../src/automation-status.mjs";
import { localDateKey } from "../src/live-freshness.mjs";

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
}

function indexMarkersFor(run, expectsDaily) {
  if (expectsDaily && Number(run.itemCount ?? run.selectedItemCount ?? 0) === 0) {
    return indexMarkers.filter((marker) => marker !== "Read source");
  }
  return indexMarkers;
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
    ["NEWSLETTER_EXPECT_MODE=auto", workflow.includes("NEWSLETTER_EXPECT_MODE=auto")],
    ["NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84", workflow.includes("NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84")],
    ["NEWSLETTER_EXPECT_FRESH_DATE=true", workflow.includes("NEWSLETTER_EXPECT_FRESH_DATE=true")],
    ["npm run check:live", workflow.includes("npm run check:live")],
    ["actions/upload-artifact", workflow.includes("actions/upload-artifact")],
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
    await checkDeploy();
    console.log("Deploy check passed");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
