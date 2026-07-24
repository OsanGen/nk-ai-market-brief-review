import test from "node:test";
import assert from "node:assert/strict";

import { publicRunReceipt } from "../src/run-receipt.mjs";

test("public run receipt is a recursively sanitized allowlist", () => {
  const receipt = publicRunReceipt({
    runId: "run-1",
    correlationId: "correlation-1",
    generatedAt: "2026-07-22T12:00:00.000Z",
    mode: "auto",
    config: {
      timezone: "America/New_York",
      targetHourLocal: 4,
      activeLookbackHours: 36,
      emailEnabled: false,
      outputDir: "/Users/operator/private",
      resendApiKey: ["re", "12345678901234567890"].join("_"),
      recipients: ["operator@example.com"]
    },
    health: {
      status: "degraded",
      pipelineStatus: "degraded",
      contentStatus: "limited",
      deploymentStatus: "not_verified",
      liveStatus: "not_verified",
      sourceCount: 2,
      successfulSourceCount: 1,
      failedSourceCount: 1,
      reasonCodes: ["partial_source_failure"],
      secret: "should-not-escape"
    },
    reviewReasons: ["Ask operator@example.com before sharing"],
    sourceCount: 2,
    sourceErrorCount: 1,
    sourceResults: [{
      sourceId: "source-1",
      sourceName: "operator@example.com",
      status: "error",
      itemCount: 0,
      errorCode: "network_error",
      errorFingerprint: "0123456789abcdef",
      errorMessage: "Bearer abcdefghijklmnopqrstuvwxyz"
    }],
    stories: [{ headline: "private story", url: "https://example.com/private?token=secret" }],
    sourceErrors: [{ error: "raw provider response" }],
    send: {
      sent: true,
      skippedReason: "",
      messageId: "message-private",
      messageIdFingerprint: "fingerprint-private"
    },
    automationConfigured: true,
    scheduledRefreshConfigured: true,
    githubPagesDeployConfigured: true,
    observabilityConfigured: true,
    observability: {
      schemaVersion: 1,
      runId: "run-1",
      correlationId: "correlation-1",
      manifest: "2026-07-22/run-1/run-manifest.json",
      summary: "2026-07-22/run-1/summary.json",
      events: "2026-07-22/run-1/events.jsonl",
      apiToken: ["ghp", "12345678901234567890"].join("_")
    },
    unexpectedSecret: "do-not-publish"
  });

  assert.equal(receipt.config.activeLookbackHours, 36);
  assert.equal(receipt.config.outputDir, undefined);
  assert.equal(receipt.config.resendApiKey, undefined);
  assert.equal(receipt.health.secret, undefined);
  assert.deepEqual(receipt.send, { sent: true, skippedReason: "" });
  assert.equal(receipt.stories, undefined);
  assert.equal(receipt.sourceErrors, undefined);
  assert.equal(receipt.unexpectedSecret, undefined);
  assert.equal(receipt.sourceResults[0].sourceName, "<redacted:email>");
  assert.equal(receipt.sourceResults[0].errorMessage, undefined);
  assert.equal(receipt.reviewReasons[0], "Ask <redacted:email> before sharing");
  assert.equal(receipt.observability.apiToken, undefined);

  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /operator@example\.com|re_123|ghp_|message-private|fingerprint-private|private story|do-not-publish|should-not-escape/);
});

test("public receipt carries aiLane/stackProfile/sourceRings/watchlist allowlists without private detail", () => {
  const receipt = publicRunReceipt({
    runId: "run-2",
    aiLane: {
      status: "ready_pending_key",
      role: "public_semantic_parser",
      model: "claude-opus-4-8",
      fallbacks: ["claude-sonnet-5"],
      packetCount: 8,
      estimatedCostUsd: 0.04,
      budgetCapUsd: 8,
      withinBudgetCap: true,
      privateRoutingBlocked: true,
      privacyStatus: "unverified",
      secretApiKey: "sk-should-never-appear"
    },
    stackProfile: {
      profileVersion: "1.0.0",
      generatedAt: "2026-07-24T00:00:00.000Z",
      sourceRepo: "MaisonMeta/NormaKamali",
      sourceCommit: "519422f06f00",
      capabilityCount: 11,
      capabilityIds: ["should", "not", "leak"],
      internalNotes: "private"
    },
    sourceRings: { total: 57, active: 40, shadow: 17, rings: {} },
    watchlist: [{
      id: "w1",
      title: "Story",
      url: "https://example.com/w?token=x#frag",
      sourceOutlet: "Outlet",
      publishedAt: "2026-07-24T00:00:00.000Z",
      score: 55,
      normaRelevance: { bonus: 7, capabilities: [{ id: "voice_commerce", label: "Voice AI / voice commerce", matchedIn: "title" }] }
    }]
  });

  assert.equal(receipt.aiLane.status, "ready_pending_key");
  assert.equal(receipt.aiLane.model, "claude-opus-4-8");
  assert.equal(receipt.aiLane.secretApiKey, undefined);
  assert.equal(receipt.stackProfile.sourceCommit, "519422f06f00");
  assert.equal(receipt.stackProfile.internalNotes, undefined);
  assert.equal(receipt.stackProfile.capabilityIds, undefined);
  assert.equal(receipt.sourceRings.active, 40);
  assert.equal(receipt.watchlist.length, 1);
  assert.equal(receipt.watchlist[0].score, undefined);
  assert.doesNotMatch(JSON.stringify(receipt), /sk-should-never-appear|token=x/);
  assert.deepEqual(receipt.watchlist[0].normaRelevance.capabilities, ["Voice AI / voice commerce"]);
});
