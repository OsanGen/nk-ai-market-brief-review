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
  assert.match(workflow, /cron: "2,7,12,17,22,27,32,37,42,47,52,57 8,9 \* \* \*"/);
  assert.match(workflow, /cron: "17 10,11,12 \* \* \*"/);
  assert.match(workflow, /NEWSLETTER_TARGET_HOUR_LOCAL: "4"/);
});

test("Workflow includes artifact and GitHub Pages deployment support", async () => {
  const workflow = await readFile(".github/workflows/newsletter.yml", "utf8");
  assert.match(workflow, /npm run should:refresh/);
  assert.match(workflow, /npm run daily/);
  assert.match(workflow, /NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 NEWSLETTER_EXPECT_FRESH_DATE=true npm run check:deploy/);
  assert.match(workflow, /npm run check:live/);
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
