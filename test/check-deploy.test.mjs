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
    - cron: "2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *"
    - cron: "17 10,11,12 * * *"
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  newsletter:
    env:
      NEWSLETTER_TARGET_HOUR_LOCAL: "4"
    steps:
      - run: npm run should:refresh
      - run: npm ci
      - run: npm test
      - run: npm run daily
      - run: npm run build
      - run: NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 NEWSLETTER_EXPECT_FRESH_DATE=true npm run check:deploy
      - run: npm run check:live
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

test("check-deploy allows limited daily output when freshness is enforced", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-daily-limited-"));
  const now = new Date();
  await writeDeployFixture(root, {
    run: {
      generatedAt: now.toISOString(),
      mode: "auto",
      reviewReady: false,
      reviewReasons: ["Only 2 qualifying stories."],
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      config: { activeLookbackHours: 36, timezone: "America/New_York" }
    }
  });

  await withEnv({
    NEWSLETTER_EXPECT_MODE: "auto",
    NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS: "84",
    NEWSLETTER_EXPECT_FRESH_DATE: "true",
    NEWSLETTER_NOW: now.toISOString()
  }, async () => {
    await assert.doesNotReject(checkDeploy(root));
  });
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
    writeFile(path.join(root, ".github", "workflows", "newsletter.yml"), workflow.replace('    - cron: "17 10,11,12 * * *"\n', ""), "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);

  await assert.rejects(checkDeploy(root), /Workflow missing configured daily refresh cron entries/);
});

test("check-deploy passes expected daily auto output", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-daily-"));
  const now = new Date();
  await writeDeployFixture(root, {
    run: {
      generatedAt: now.toISOString(),
      mode: "auto",
      reviewReady: true,
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      config: { activeLookbackHours: 36, timezone: "America/New_York" }
    }
  });

  await withEnv({
    NEWSLETTER_EXPECT_MODE: "auto",
    NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS: "84",
    NEWSLETTER_EXPECT_FRESH_DATE: "true",
    NEWSLETTER_NOW: now.toISOString()
  }, async () => {
    await assert.doesNotReject(checkDeploy(root));
  });
});

test("check-deploy fails when expected daily output is stale", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-stale-date-"));
  await writeDeployFixture(root, {
    run: {
      generatedAt: "2026-05-14T08:00:00.000Z",
      mode: "auto",
      reviewReady: true,
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      config: { activeLookbackHours: 36, timezone: "America/New_York" }
    }
  });

  await withEnv({
    NEWSLETTER_EXPECT_MODE: "auto",
    NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS: "84",
    NEWSLETTER_EXPECT_FRESH_DATE: "true",
    NEWSLETTER_NOW: "2026-05-15T08:00:00.000Z"
  }, async () => {
    await assert.rejects(checkDeploy(root), /generatedAt is not fresh/);
  });
});

test("check-deploy fails when expected daily output is preview", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-preview-mode-"));
  await writeDeployFixture(root, {
    run: {
      mode: "preview",
      reviewReady: true,
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      config: { activeLookbackHours: 168 }
    }
  });

  await withEnv({
    NEWSLETTER_EXPECT_MODE: "auto",
    NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS: "84"
  }, async () => {
    await assert.rejects(checkDeploy(root), /Expected site\/run\.json mode auto, got preview/);
  });
});

test("check-deploy fails when expected daily lookback is too wide", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "nk-review-check-wide-lookback-"));
  await writeDeployFixture(root, {
    run: {
      mode: "auto",
      reviewReady: true,
      automationConfigured: true,
      scheduledRefreshConfigured: true,
      config: { activeLookbackHours: 168 }
    }
  });

  await withEnv({
    NEWSLETTER_EXPECT_MODE: "auto",
    NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS: "84"
  }, async () => {
    await assert.rejects(checkDeploy(root), /active lookback 168 exceeds 84/);
  });
});

async function writeDeployFixture(root, { run, workflowText = workflow }) {
  await mkdir(path.join(root, "site"), { recursive: true });
  await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(root, "site", "index.html"),
      '<!doctype html><title>NK AI Market Brief</title><body><p>Internal review</p><p>Email disabled</p><a href="newsletter.txt">newsletter.txt</a><a>Read source</a></body>',
      "utf8"
    ),
    writeFile(path.join(root, "site", "newsletter.txt"), "NK AI Market Brief\n", "utf8"),
    writeFile(path.join(root, "site", "run.json"), `${JSON.stringify(run)}\n`, "utf8"),
    writeFile(path.join(root, ".github", "workflows", "newsletter.yml"), workflowText, "utf8"),
    writeFile(path.join(root, ".env.example"), "NEWSLETTER_SEND_ENABLED=false\n", "utf8"),
    writeFile(path.join(root, "SHARE_WITH_CYRIL.md"), "# Share\n", "utf8"),
    writeFile(path.join(root, "FULL_TECH_BUILD.txt"), "# Snapshot\n", "utf8")
  ]);
}

async function withEnv(values, callback) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
