import { readFile } from "node:fs/promises";
import path from "node:path";

export const AUTOMATION_SCHEDULE = ["17 12 * * 1-5", "17 13 * * 1-5"];
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
  const ciConfigured = workflowFound && ["npm ci", "npm test", "npm run daily", "npm run check:deploy"].every((command) => workflow.includes(command));
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
    targetHourLocal: 8,
    manualPushRequiredAfterSetup: !automationConfigured
  };
}
