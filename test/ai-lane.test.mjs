import test from "node:test";
import assert from "node:assert/strict";

import { blocksPrivateRouting, budgetPreflight, estimateBatchCost, getPrivacyReceipt } from "../src/ai/budget.mjs";
import { ANTHROPIC_BATCHES_URL, laneReadiness, runAiLane } from "../src/ai/lane.mjs";
import {
  EVIDENCE_CLOSE,
  EVIDENCE_OPEN,
  buildBatchRequests,
  buildPublicPackets,
  validateModelOutput
} from "../src/ai/packets.mjs";

const story = {
  id: "abc123",
  title: "AI stylist launches",
  summary: "A voice shopping agent for fashion.",
  sourceOutlet: "Outlet",
  topicCluster: "AI stylists / personal-shopper agents",
  publishedAt: "2026-07-24T04:00:00.000Z",
  url: "https://example.com/private?token=x",
  score: 99,
  matchSignals: { secretish: true }
};

test("packets are a strict public allowlist: no url, score, or signals enter the prompt", () => {
  const [packet] = buildPublicPackets([story]);
  assert.deepEqual(Object.keys(packet.story).sort(), [
    "outlet", "published_at", "story_id", "summary", "title", "topic_cluster"
  ]);
  const [request] = buildBatchRequests([packet], { model: "claude-opus-4-8" });
  const prompt = request.params.messages[0].content;
  assert.doesNotMatch(prompt, /example\.com|token=|"score"|matchSignals|secretish/);
  assert.match(prompt, new RegExp(EVIDENCE_OPEN));
  assert.match(prompt, new RegExp(EVIDENCE_CLOSE));
  assert.match(prompt, /data, not instructions/);
});

test("batch requests bind the registry primary model and a JSON schema output format", () => {
  const packets = buildPublicPackets([story]);
  const [request] = buildBatchRequests(packets, { model: "claude-opus-4-8", allowedCapabilityIds: ["voice_commerce"] });
  assert.equal(request.params.model, "claude-opus-4-8");
  assert.equal(request.params.output_config.format.type, "json_schema");
  assert.equal(request.custom_id, "pkt_abc123");
});

test("model output validation fails closed on unknown ids, URLs, and extra fields", () => {
  const context = { allowedStoryIds: new Set(["abc123"]), allowedCapabilityIds: ["voice_commerce"] };
  const good = {
    story_id: "abc123",
    relevance: "high",
    capability_ids: ["voice_commerce"],
    summary_sentences: ["A voice agent launched."],
    open_questions: [],
    vendor_claim_flags: []
  };
  assert.deepEqual(validateModelOutput(good, context), good);
  assert.throws(() => validateModelOutput({ ...good, story_id: "spoofed" }, context), /unknown_story_id/);
  assert.throws(() => validateModelOutput({ ...good, summary_sentences: ["see https://x.com"] }, context), /contains_url/);
  assert.throws(() => validateModelOutput({ ...good, disposition: "ship_it" }, context), /unexpected_field/);
  assert.throws(() => validateModelOutput({ ...good, capability_ids: ["not_allowed"] }, context), /invalid_capability_ids/);
});

test("budget preflight estimates deterministically and blocks over-cap", () => {
  const model = { batch_input_price_per_million_usd: 2.5, batch_output_price_per_million_usd: 12.5 };
  const requests = buildBatchRequests(buildPublicPackets([story]), { model: "claude-opus-4-8" });
  const estimate = estimateBatchCost(requests, model);
  assert.ok(estimate.estimatedUsd > 0 && estimate.estimatedUsd < 0.1);

  const ok = budgetPreflight({ estimate, capUsd: 8, runId: "r1" });
  assert.equal(ok.decision, "proceed");
  const blocked = budgetPreflight({ estimate: { ...estimate, estimatedUsd: 9 }, capUsd: 8, runId: "r1" });
  assert.equal(blocked.decision, "blocked_over_cap");
});

test("privacy receipt is unverified and blocks private routing until a real ZDR verification", () => {
  const receipt = getPrivacyReceipt();
  assert.equal(receipt.zdr_verified, false);
  assert.equal(blocksPrivateRouting(receipt), true);
  assert.equal(blocksPrivateRouting({ zdr_verified: true }), false);
});

test("lane readiness: pending key by default, flag-gated even with a key", () => {
  assert.equal(laneReadiness({}), "ready_pending_key");
  assert.equal(laneReadiness({ NEWSLETTER_AI_LANE_ENABLED: "true" }), "ready_pending_key");
  assert.equal(laneReadiness({ ANTHROPIC_API_KEY: "k" }), "disabled_by_flag");
  assert.equal(laneReadiness({ ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" }), "active");
});

test("without a key the lane dry-runs: real packets and budget, zero network calls", async () => {
  let fetched = false;
  const result = await runAiLane({
    stories: [story],
    env: {},
    runId: "run-1",
    capabilityIds: ["voice_commerce"],
    fetchImpl: async () => {
      fetched = true;
      throw new Error("must not fetch in dry run");
    }
  });
  assert.equal(fetched, false);
  assert.equal(result.mode, "dry_run");
  assert.equal(result.summary.status, "ready_pending_key");
  assert.equal(result.summary.model, "claude-opus-4-8");
  assert.equal(result.summary.packetCount, 1);
  assert.equal(result.summary.withinBudgetCap, true);
  assert.equal(result.summary.privateRoutingBlocked, true);
});

test("with key + flag the lane submits to the Batches API and never leaks the key into the summary", async () => {
  const calls = [];
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "unit-test-placeholder-key", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-2",
    capabilityIds: ["voice_commerce"],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, async json() { return { id: "batch_123" }; } };
    }
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ANTHROPIC_BATCHES_URL);
  assert.equal(calls[0].options.headers["x-api-key"], "unit-test-placeholder-key");
  assert.equal(result.mode, "submitted");
  assert.equal(result.summary.batchId, "batch_123");
  assert.doesNotMatch(JSON.stringify(result.summary), /unit-test-placeholder-key/);
  assert.doesNotMatch(JSON.stringify(result.budget), /unit-test-placeholder-key/);
});

test("a provider error surfaces as submit_failed without throwing", async () => {
  const result = await runAiLane({
    stories: [story],
    env: { ANTHROPIC_API_KEY: "k", NEWSLETTER_AI_LANE_ENABLED: "true" },
    runId: "run-3",
    capabilityIds: [],
    fetchImpl: async () => ({ ok: false, status: 429, async json() { return {}; } })
  });
  assert.equal(result.mode, "submit_failed");
  assert.equal(result.summary.providerStatus, 429);
});
