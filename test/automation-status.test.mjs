import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getAutomationStatus } from "../src/automation-status.mjs";

test("Workflow file exists and includes manual dispatch", async () => {
  const workflow = await readFile(".github/workflows/newsletter.yml", "utf8");
  assert.match(workflow, /workflow_dispatch/);
});

test("Workflow includes both scheduled cron entries", async () => {
  const workflow = await readFile(".github/workflows/newsletter.yml", "utf8");
  assert.match(workflow, /cron: "17 12 \* \* 1-5"/);
  assert.match(workflow, /cron: "17 13 \* \* 1-5"/);
});

test("Workflow includes artifact and GitHub Pages deployment support", async () => {
  const workflow = await readFile(".github/workflows/newsletter.yml", "utf8");
  assert.match(workflow, /npm run daily/);
  assert.match(workflow, /NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 npm run check:deploy/);
  assert.doesNotMatch(workflow, /\n\s*-\s*run: npm run build\n/);
  assert.match(workflow, /actions\/upload-artifact/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
  assert.match(workflow, /DEPLOY_GITHUB_PAGES == 'true'/);
});

test("Workflow has Pages permissions", async () => {
  const workflow = await readFile(".github/workflows/newsletter.yml", "utf8");
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /id-token: write/);
});

test("Automation status is configured when workflow exists", async () => {
  const status = await getAutomationStatus();
  assert.equal(status.githubActionsWorkflowFound, true);
  assert.equal(status.scheduledRefreshConfigured, true);
  assert.equal(status.githubPagesDeployConfigured, true);
  assert.equal(status.automationConfigured, true);
  assert.equal(status.manualPushRequiredAfterSetup, false);
});
