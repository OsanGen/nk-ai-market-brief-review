import { readFile } from "node:fs/promises";
import path from "node:path";

export const AUTOMATION_SCHEDULE = [
  "2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *",
  "17 10,11,12 * * *"
];
export const PAGES_GATE_VARIABLE = "DEPLOY_GITHUB_PAGES";
export const WORKFLOW_PATH = ".github/workflows/newsletter.yml";

export async function getAutomationStatus(root = process.cwd()) {
  const workflowPath = path.join(root, WORKFLOW_PATH);
  let workflow = "";
  let workflowFound = false;

  try {
    workflow = await readFile(workflowPath, "utf8");
    workflowFound = true;
  } catch {
    workflowFound = false;
  }

  const scheduledRefreshConfigured = workflowFound && AUTOMATION_SCHEDULE.every((cron) => workflow.includes(`cron: "${cron}"`) || workflow.includes(`cron: '${cron}'`));
  const manualDispatchConfigured = workflowFound && workflow.includes("workflow_dispatch");
  const ciConfigured = workflowFound && [
    "npm ci",
    "npm test",
    "npm run should:refresh",
    "npm run daily",
    "npm run check:deploy",
    "npm run check:live"
  ].every((command) => workflow.includes(command));
  const artifactUploadConfigured = workflowFound && workflow.includes("actions/upload-artifact");
  const githubPagesDeployConfigured = workflowFound
    && workflow.includes("actions/upload-pages-artifact")
    && workflow.includes("actions/deploy-pages")
    && workflow.includes("pages: write")
    && workflow.includes("id-token: write")
    && workflow.includes(PAGES_GATE_VARIABLE);

  const automationConfigured = workflowFound
    && manualDispatchConfigured
    && scheduledRefreshConfigured
    && ciConfigured
    && artifactUploadConfigured
    && githubPagesDeployConfigured;

  return {
    automationConfigured,
    githubActionsWorkflowFound: workflowFound,
    scheduledRefreshConfigured,
    githubPagesDeployConfigured,
    githubPagesDeployGatedBy: PAGES_GATE_VARIABLE,
    schedule: AUTOMATION_SCHEDULE,
    timezone: "America/New_York",
    targetHourLocal: 4,
    manualPushRequiredAfterSetup: !automationConfigured
  };
}
