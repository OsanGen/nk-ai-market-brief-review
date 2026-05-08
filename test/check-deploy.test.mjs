import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkDeploy } from "../scripts/check-deploy.mjs";

const workflow = `name: NK AI Market Brief
on:
  workflow_dispatch:
  schedule:
    - cron: "17 12 * * 1-5"
    - cron: "17 13 * * 1-5"
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  newsletter:
    steps:
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: npm run check:deploy
      - uses: actions/upload-artifact@v4
      - uses: actions/upload-pages-artifact@v3
      - uses: actions/deploy-pages@v4
        if: \${{ vars.DEPLOY_GITHUB_PAGES == 'true' }}
`;

test("check-deploy passes for built review page files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-"));
  await mkdir(path.join(root, "site"), { recursive: true });
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "site", "index.html"),
      '<!doctype html><title>NK AI Market Brief</title><body><p>Internal review</p><p>Email disabled</p><a href="newsletter.txt">newsletter.txt</a><a>Read source</a></body>',
      "utf8"
    ),
    writeFile(path.join(root, "site", "newsletter.txt"), "NK AI Market Brief\n", "utf8"),
    writeFile(path.join(root, "site", "run.json"), "{\"reviewReady\":true,\"automationConfigured\":true,\"scheduledRefreshConfigured\":true}\n", "utf8"),
    writeFile(path.join(root, ".github", "workflows", "newsletter.yml"), workflow, "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);

  await assert.doesNotReject(checkDeploy(root));
});

test("check-deploy fails when reviewReady is false", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-fail-"));
  await mkdir(path.join(root, "site"), { recursive: true });
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "site", "index.html"),
      '<!doctype html><title>NK AI Market Brief</title><body><p>Internal review</p><p>Email disabled</p><a href="newsletter.txt">newsletter.txt</a><a>Read source</a></body>',
      "utf8"
    ),
    writeFile(path.join(root, "site", "newsletter.txt"), "NK AI Market Brief\n", "utf8"),
    writeFile(path.join(root, "site", "run.json"), "{\"reviewReady\":false,\"reviewReasons\":[\"too few stories\"],\"automationConfigured\":true,\"scheduledRefreshConfigured\":true}\n", "utf8"),
    writeFile(path.join(root, ".github", "workflows", "newsletter.yml"), workflow, "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);

  await assert.rejects(checkDeploy(root), /too few stories/);
});

test("check-deploy fails when workflow is missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-no-workflow-"));
  await mkdir(path.join(root, "site"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "site", "index.html"),
      '<!doctype html><title>NK AI Market Brief</title><body><p>Internal review</p><p>Email disabled</p><a href="newsletter.txt">newsletter.txt</a><a>Read source</a></body>',
      "utf8"
    ),
    writeFile(path.join(root, "site", "newsletter.txt"), "NK AI Market Brief\n", "utf8"),
    writeFile(path.join(root, "site", "run.json"), "{\"reviewReady\":true,\"automationConfigured\":true,\"scheduledRefreshConfigured\":true}\n", "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);

  await assert.rejects(checkDeploy(root), /newsletter\.yml/);
});

test("check-deploy fails when scheduled cron entries are missing", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-bad-cron-"));
  await mkdir(path.join(root, "site"), { recursive: true });
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "site", "index.html"),
      '<!doctype html><title>NK AI Market Brief</title><body><p>Internal review</p><p>Email disabled</p><a href="newsletter.txt">newsletter.txt</a><a>Read source</a></body>',
      "utf8"
    ),
    writeFile(path.join(root, "site", "newsletter.txt"), "NK AI Market Brief\n", "utf8"),
    writeFile(path.join(root, "site", "run.json"), "{\"reviewReady\":true,\"automationConfigured\":true,\"scheduledRefreshConfigured\":true}\n", "utf8"),
    writeFile(path.join(root, ".github", "workflows", "newsletter.yml"), workflow.replace('    - cron: "17 13 * * 1-5"\n', ""), "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);

  await assert.rejects(checkDeploy(root), /Workflow missing cron/);
});
