import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { AUTOMATION_SCHEDULE, getAutomationStatus, WORKFLOW_PATH } from "../src/automation-status.mjs";

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
  for (const file of ["site/index.html", "site/newsletter.txt"]) {
    const text = await readFile(path.join(root, file), "utf8");
    if (forbidden.test(text)) throw new Error(`Forbidden public-output pattern in ${file}`);
    if (file === "site/index.html") {
      for (const marker of indexMarkers) {
        if (!text.includes(marker)) throw new Error(`Missing "${marker}" in site/index.html`);
      }
    }
  }

  const run = JSON.parse(await readFile(path.join(root, "site/run.json"), "utf8"));
  if (!run.reviewReady && process.env.ALLOW_NOT_READY_REVIEW !== "true") {
    throw new Error(`Review page is not ready: ${(run.reviewReasons ?? []).join(" ") || "reviewReady=false"}`);
  }
  await checkWorkflow(root);
  if (run.automationConfigured !== true) throw new Error("site/run.json automationConfigured is not true");
  if (run.scheduledRefreshConfigured !== true) throw new Error("site/run.json scheduledRefreshConfigured is not true");
}

async function checkWorkflow(root) {
  const workflow = await readFile(path.join(root, WORKFLOW_PATH), "utf8");
  const checks = [
    ["workflow_dispatch", workflow.includes("workflow_dispatch")],
    [`cron: "17 12 * * 1-5"`, AUTOMATION_SCHEDULE.every((cron) => workflow.includes(`cron: "${cron}"`) || workflow.includes(`cron: '${cron}'`))],
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
